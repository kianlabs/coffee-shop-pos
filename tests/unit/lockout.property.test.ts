import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { INITIAL_LOCKOUT, isAccepted, isLocked, nextLockoutState, type PinOutcome } from "@/domain/lockout";

const T0 = 1_700_000_000_000;

// Property 22: PIN lockout state machine (Req 1.3, 1.4, 1.12)
describe("Property 22: PIN lockout state machine", () => {
  const attempt = fc.record({
    outcome: fc.constantFrom<PinOutcome>("correct", "wrong"),
    gapMs: fc.integer({ min: 0, max: 4 * 60_000 }),
  });
  const config = fc.record({ maxAttempts: fc.integer({ min: 3, max: 10 }), durationMinutes: fc.integer({ min: 1, max: 60 }) });

  it("matches a reference model for any non-decreasing attempt sequence", () => {
    fc.assert(
      fc.property(config, fc.array(attempt, { maxLength: 60 }), (c, attempts) => {
        let state = INITIAL_LOCKOUT;
        let now = T0;
        let streak = 0;
        let lockEnd: number | null = null;
        for (const { outcome, gapMs } of attempts) {
          now += gapMs;
          const locked = lockEnd !== null && now < lockEnd;
          expect(isLocked(state, now)).toBe(locked);
          expect(isAccepted(state, outcome, now)).toBe(!locked && outcome === "correct");
          if (!locked) {
            if (lockEnd !== null) [streak, lockEnd] = [0, null];
            streak = outcome === "correct" ? 0 : streak + 1;
            if (streak === c.maxAttempts) lockEnd = now + c.durationMinutes * 60_000;
          }
          state = nextLockoutState(state, outcome, now, c);
          expect(state.lockedUntil).toBe(lockEnd);
          expect(state.failedAttempts).toBe(streak);
          expect(state.failedAttempts).toBeLessThanOrEqual(c.maxAttempts);
        }
      }),
    );
  });
});
