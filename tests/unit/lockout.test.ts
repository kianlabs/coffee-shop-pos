import { describe, expect, it } from "vitest";
import {
  INITIAL_LOCKOUT,
  formatLockRemaining,
  isAccepted,
  isLocked,
  nextLockoutState,
  remainingAttempts,
  remainingLockMs,
  type LockoutConfig,
  type LockoutState,
  type PinOutcome,
} from "@/domain/lockout";

const cfg: LockoutConfig = { maxAttempts: 3, durationMinutes: 5 };
const T0 = 1_700_000_000_000;
const LOCK_MS = 5 * 60_000;

function apply(outcomes: PinOutcome[], start = T0, step = 1000): LockoutState {
  return outcomes.reduce((s, o, i) => nextLockoutState(s, o, start + i * step, cfg), INITIAL_LOCKOUT);
}

describe("nextLockoutState", () => {
  it("counts wrong PINs and reports remaining attempts", () => {
    const s = apply(["wrong"]);
    expect(s).toEqual({ failedAttempts: 1, lockedAt: null, lockedUntil: null });
    expect(remainingAttempts(s, T0, cfg)).toBe(2);
  });

  it("resets the count on a correct PIN before the limit", () => {
    expect(apply(["wrong", "wrong", "correct"])).toEqual(INITIAL_LOCKOUT);
  });

  it("locks on the n-th consecutive wrong PIN, for the configured duration", () => {
    const s = apply(["wrong", "wrong", "wrong"]);
    const trigger = T0 + 2000;
    expect(s).toEqual({ failedAttempts: 3, lockedAt: trigger, lockedUntil: trigger + LOCK_MS });
    expect(isLocked(s, trigger)).toBe(true);
    expect(remainingAttempts(s, trigger, cfg)).toBe(0);
    expect(remainingLockMs(s, trigger + 1000)).toBe(LOCK_MS - 1000);
  });

  it("rejects a correct PIN while locked and leaves the state unchanged", () => {
    const s = apply(["wrong", "wrong", "wrong"]);
    const now = T0 + 60_000;
    expect(isAccepted(s, "correct", now)).toBe(false);
    expect(nextLockoutState(s, "correct", now, cfg)).toBe(s);
    expect(nextLockoutState(s, "wrong", now, cfg)).toBe(s);
  });

  it("unlocks exactly at lockedUntil and starts counting from zero", () => {
    const s = apply(["wrong", "wrong", "wrong"]);
    const until = s.lockedUntil ?? 0;
    expect(isLocked(s, until - 1)).toBe(true);
    expect(isLocked(s, until)).toBe(false);
    expect(remainingLockMs(s, until)).toBe(0);
    expect(remainingAttempts(s, until, cfg)).toBe(3);
    expect(isAccepted(s, "correct", until)).toBe(true);
    expect(nextLockoutState(s, "correct", until, cfg)).toEqual(INITIAL_LOCKOUT);
    expect(nextLockoutState(s, "wrong", until, cfg).failedAttempts).toBe(1);
  });

  it("stays locked when the clock goes back before lockedAt", () => {
    const s = apply(["wrong", "wrong", "wrong"]);
    const lockedAt = s.lockedAt ?? 0;
    const backwards = lockedAt - 24 * 60 * 60_000;
    expect(isLocked(s, backwards)).toBe(true);
    expect(isAccepted(s, "correct", backwards)).toBe(false);
    expect(nextLockoutState(s, "correct", backwards, cfg)).toBe(s);
    expect(remainingLockMs(s, backwards)).toBe(lockedAt + LOCK_MS - backwards);
  });

  it("accepts a correct PIN when not locked", () => {
    expect(isAccepted(INITIAL_LOCKOUT, "correct", T0)).toBe(true);
    expect(isAccepted(INITIAL_LOCKOUT, "wrong", T0)).toBe(false);
  });
});

describe("formatLockRemaining", () => {
  it("formats minutes and seconds, rounding seconds up", () => {
    expect(formatLockRemaining(LOCK_MS)).toBe("5:00");
    expect(formatLockRemaining(61_001)).toBe("1:02");
    expect(formatLockRemaining(999)).toBe("0:01");
    expect(formatLockRemaining(-5)).toBe("0:00");
  });
});
