import { isIdleExpired } from "@/domain/idleLock";
import type { Role } from "@/domain/permissions";
import { attemptPin } from "./authPin";
import type { Clock } from "./ports";
import type { AuthUnitOfWork, PinHasher, SecurityLimits, UserRecord } from "./ports/users";
export interface Session {
  userId: string;
  displayName: string;
  role: Role;
  startedAt: number;
}
export type LoginResult =
  | { ok: true; session: Session }
  | { ok: false; code: "unknown_user" | "wrong_pin" | "locked" | "failed"; message: string; remainingAttempts?: number; remainingLockMs?: number };
export interface AuthServiceDeps {
  uow: AuthUnitOfWork;
  hasher: PinHasher;
  clock: Clock;
  /** Reads current `keamanan.*` values (for example from SettingsService.get). */
  limits: () => SecurityLimits;
}
const UNKNOWN = "Pengguna tidak ditemukan atau nonaktif.";
const FAILED = "Login gagal. Coba lagi.";
function toSession(user: UserRecord, startedAt: number): Session {
  return { userId: user.id, displayName: user.displayName, role: user.role, startedAt };
}
/** Login, in-memory session, and idle lock (Req 1.3, 1.4, 1.5, 1.12). PINs and lock state are stored per user. */
export class AuthService {
  private current: Session | null = null;
  private screenLocked = false;
  private lastActivity = 0;
  constructor(private readonly deps: AuthServiceDeps) {}
  session(): Session | null {
    return this.current;
  }
  isScreenLocked(): boolean {
    return this.screenLocked;
  }
  async login(userId: string, pin: string): Promise<LoginResult> {
    const result = await this.check(userId, pin);
    if (!result.ok) return result;
    const now = this.deps.clock.now().getTime();
    this.current = toSession(result.user, now);
    this.screenLocked = false;
    this.lastActivity = now;
    return { ok: true, session: this.current };
  }
  logout(): void {
    this.current = null;
    this.screenLocked = false;
  }
  /** Records a touch, click, or key press. Ignored while the screen is locked. */
  touch(): void {
    if (this.current && !this.screenLocked) this.lastActivity = this.deps.clock.now().getTime();
  }
  /** Locks the screen when idle time has run out. Returns whether the screen is locked now. */
  checkIdle(): boolean {
    if (!this.current || this.screenLocked) return this.screenLocked;
    const now = this.deps.clock.now().getTime();
    if (isIdleExpired(this.lastActivity, now, this.deps.limits().idleMinutes)) this.screenLocked = true;
    return this.screenLocked;
  }
  lockScreen(): void {
    if (this.current) this.screenLocked = true;
  }
  /** Unlocks with the session user's PIN. The session and everything the UI holds stay as they were. */
  async unlock(pin: string): Promise<LoginResult> {
    const session = this.current;
    if (!session) return { ok: false, code: "unknown_user", message: UNKNOWN };
    const result = await this.check(session.userId, pin);
    if (!result.ok) return result;
    this.screenLocked = false;
    this.lastActivity = this.deps.clock.now().getTime();
    return { ok: true, session };
  }
  private async check(userId: string, pin: string): Promise<{ ok: true; user: UserRecord } | Extract<LoginResult, { ok: false }>> {
    try {
      const nowDate = this.deps.clock.now();
      const attempt = await this.deps.uow.transact(async (tx) => {
        const user = await tx.users.get(userId);
        if (!user || !user.isActive) return null;
        return attemptPin(tx, this.deps.hasher, user, pin, nowDate.getTime(), this.deps.limits(), nowDate.toISOString());
      });
      if (!attempt) return { ok: false, code: "unknown_user", message: UNKNOWN };
      if (attempt.kind === "ok") return { ok: true, user: attempt.user };
      if (attempt.kind === "locked") return { ok: false, code: "locked", message: attempt.message, remainingLockMs: attempt.remainingMs };
      return { ok: false, code: "wrong_pin", message: attempt.message, remainingAttempts: attempt.remaining };
    } catch {
      return { ok: false, code: "failed", message: FAILED };
    }
  }
}
