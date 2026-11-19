/**
 * Idle screen lock (Req 1.5). Pure: the caller passes `now` and the time of
 * the last touch, click, or key press (epoch ms).
 */
const MINUTE_MS = 60_000;
/**
 * True once `idleMinutes` have passed since `lastActivityAt`. A clock set back
 * before the last activity never locks.
 */
export function isIdleExpired(lastActivityAt: number, now: number, idleMinutes: number): boolean {
  return now - lastActivityAt >= idleMinutes * MINUTE_MS;
}
/** Milliseconds until the idle lock triggers (0 when already due). */
export function idleRemainingMs(lastActivityAt: number, now: number, idleMinutes: number): number {
  const elapsed = Math.max(0, now - lastActivityAt);
  return Math.max(0, idleMinutes * MINUTE_MS - elapsed);
}
