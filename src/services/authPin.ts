import { formatLockRemaining, isLocked, nextLockoutState, remainingAttempts, remainingLockMs, type LockoutState } from "@/domain/lockout";
import type { AuthTx, PinHasher, SecurityLimits, UserRecord } from "./ports/users";
export type PinAttempt =
  | { kind: "ok"; user: UserRecord }
  | { kind: "locked"; remainingMs: number; message: string }
  | { kind: "wrong"; remaining: number; message: string };
export function lockoutOf(user: UserRecord): LockoutState {
  return { failedAttempts: user.failedAttempts, lockedAt: user.lockedAt, lockedUntil: user.lockedUntil };
}
function lockedMessage(ms: number): string {
  return `Login terkunci. Coba lagi dalam ${formatLockRemaining(ms)}.`;
}
/**
 * Checks one PIN against a user and stores the new lock state (Req 1.3, 1.4, 1.12).
 * A locked user is rejected without looking at the PIN. Runs inside the caller's transaction.
 */
export async function attemptPin(
  tx: AuthTx,
  hasher: PinHasher,
  user: UserRecord,
  pin: string,
  now: number,
  limits: SecurityLimits,
  updatedAt: string,
): Promise<PinAttempt> {
  const before = lockoutOf(user);
  if (isLocked(before, now)) {
    const remainingMs = remainingLockMs(before, now);
    return { kind: "locked", remainingMs, message: lockedMessage(remainingMs) };
  }
  const correct = await hasher.verify(pin, user.pinHash);
  const cfg = { maxAttempts: limits.maxAttempts, durationMinutes: limits.lockMinutes };
  const next = nextLockoutState(before, correct ? "correct" : "wrong", now, cfg);
  const changed = next.failedAttempts !== user.failedAttempts || next.lockedAt !== user.lockedAt || next.lockedUntil !== user.lockedUntil;
  const saved: UserRecord = { ...user, ...next, updatedAt: changed ? updatedAt : user.updatedAt };
  if (changed) await tx.users.update(saved);
  if (correct) return { kind: "ok", user: saved };
  if (isLocked(next, now)) {
    const remainingMs = remainingLockMs(next, now);
    return { kind: "locked", remainingMs, message: lockedMessage(remainingMs) };
  }
  const remaining = remainingAttempts(next, now, cfg);
  return { kind: "wrong", remaining, message: `PIN salah. Sisa percobaan: ${remaining}.` };
}
