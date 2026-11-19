/**
 * PIN lockout state machine (Req 1.3, 1.4, 1.12). Pure: time comes in as `now`
 * (epoch ms). The data layer persists `failedAttempts` and `lockedUntil`.
 */
export interface LockoutState {
  /** Consecutive wrong PINs since the last correct PIN or expired lock. */
  failedAttempts: number;
  /** Time of the attempt that triggered the lock, or null when not locked. */
  lockedAt: number | null;
  /** `lockedAt + duration`, fixed at lock time, or null when not locked. */
  lockedUntil: number | null;
}

export interface LockoutConfig {
  /** `keamanan.maks_percobaan_pin` */
  maxAttempts: number;
  /** `keamanan.durasi_kunci_menit` */
  durationMinutes: number;
}

export type PinOutcome = "correct" | "wrong";

export const INITIAL_LOCKOUT: LockoutState = { failedAttempts: 0, lockedAt: null, lockedUntil: null };

const MINUTE_MS = 60_000;

/**
 * Locked while `now < lockedUntil`. A clock set back before `lockedAt` keeps
 * the lock until `lockedAt + duration`; it never unlocks early.
 */
export function isLocked(state: LockoutState, now: number): boolean {
  return state.lockedUntil !== null && now < state.lockedUntil;
}

/** Remaining lock time in ms (0 when not locked). */
export function remainingLockMs(state: LockoutState, now: number): number {
  if (!isLocked(state, now) || state.lockedUntil === null) return 0;
  return state.lockedUntil - now;
}

/** Wrong PINs still allowed before the lock triggers (0 while locked). */
export function remainingAttempts(state: LockoutState, now: number, cfg: LockoutConfig): number {
  if (isLocked(state, now)) return 0;
  const failed = state.lockedUntil === null ? state.failedAttempts : 0;
  return Math.max(0, cfg.maxAttempts - failed);
}

/** True when this attempt opens a session: not locked and the PIN is correct. */
export function isAccepted(state: LockoutState, outcome: PinOutcome, now: number): boolean {
  return outcome === "correct" && !isLocked(state, now);
}

/**
 * Applies one PIN attempt. While locked every attempt is rejected and the
 * state is unchanged. An expired lock is cleared before the attempt counts.
 */
export function nextLockoutState(
  state: LockoutState,
  outcome: PinOutcome,
  now: number,
  cfg: LockoutConfig,
): LockoutState {
  if (isLocked(state, now)) return state;
  const failed = state.lockedUntil === null ? state.failedAttempts : 0;
  if (outcome === "correct") return INITIAL_LOCKOUT;
  const failedAttempts = failed + 1;
  if (failedAttempts < cfg.maxAttempts) return { failedAttempts, lockedAt: null, lockedUntil: null };
  return { failedAttempts, lockedAt: now, lockedUntil: now + cfg.durationMinutes * MINUTE_MS };
}

/** Formats remaining lock time as `m:ss` for "Coba lagi dalam ..." messages. */
export function formatLockRemaining(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
