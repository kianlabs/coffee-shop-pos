import { INITIAL_LOCKOUT } from "@/domain/lockout";
import { isRole, type Role } from "@/domain/permissions";
import { validateDisplayName, validatePin } from "@/domain/validation";
import { attemptPin } from "./authPin";
import type { Clock, Ids } from "./ports";
import type { AuthTx, AuthUnitOfWork, PinHasher, SecurityLimits, UserRecord } from "./ports/users";
export type UserAdminCode = "forbidden" | "invalid" | "not_found" | "last_owner" | "wrong_pin" | "locked" | "failed";
export type UserAdminResult = { ok: true; user: UserRecord } | { ok: false; code: UserAdminCode; message: string; rule?: string };
export interface UserAdminDeps {
  uow: AuthUnitOfWork;
  hasher: PinHasher;
  clock: Clock;
  ids: Ids;
  limits: () => SecurityLimits;
}
/** Thrown inside the transaction so nothing is committed. */
class Rejected extends Error {
  constructor(readonly code: UserAdminCode, message: string, readonly rule?: string) {
    super(message);
  }
}
const FORBIDDEN = "Hanya owner yang boleh mengelola pengguna.";
const LAST_OWNER = "Minimal satu owner aktif wajib ada.";
/** Create, deactivate, role change, and PIN change. Writes an audit row (never the PIN) with each change (Req 1.1, 1.7, 1.8, 1.11). */
export class UserAdminService {
  constructor(private readonly deps: UserAdminDeps) {}
  createUser(actorId: string, input: { displayName: string; pin: string; role: Role }): Promise<UserAdminResult> {
    return this.perform(async (tx, now) => {
      await this.requireOwner(tx, actorId);
      if (!isRole(input.role)) throw new Rejected("invalid", "Peran tidak dikenal.", "role_unknown");
      const name = await this.checkName(tx, input.displayName, null);
      this.checkPin(input.pin);
      const user: UserRecord = {
        id: this.deps.ids.next(), displayName: name, role: input.role, pinHash: await this.deps.hasher.hash(input.pin),
        isActive: true, ...INITIAL_LOCKOUT, createdAt: now, updatedAt: now,
      };
      await tx.users.insert(user);
      await this.audit(tx, actorId, "user.create", user, null, { displayName: name, role: user.role }, now);
      return user;
    });
  }
  deactivate(actorId: string, targetId: string): Promise<UserAdminResult> {
    return this.perform(async (tx, now) => {
      await this.requireOwner(tx, actorId);
      const target = await this.requireTarget(tx, targetId);
      if (!target.isActive) return target;
      await this.guardLastOwner(tx, target);
      const saved = { ...target, isActive: false, updatedAt: now };
      await tx.users.update(saved);
      await this.audit(tx, actorId, "user.deactivate", target, { isActive: true }, { isActive: false }, now);
      return saved;
    });
  }
  changeRole(actorId: string, targetId: string, role: Role): Promise<UserAdminResult> {
    return this.perform(async (tx, now) => {
      await this.requireOwner(tx, actorId);
      if (!isRole(role)) throw new Rejected("invalid", "Peran tidak dikenal.", "role_unknown");
      const target = await this.requireTarget(tx, targetId);
      if (target.role === role) return target;
      if (role !== "owner") await this.guardLastOwner(tx, target);
      const saved = { ...target, role, updatedAt: now };
      await tx.users.update(saved);
      await this.audit(tx, actorId, "user.change_role", target, { role: target.role }, { role }, now);
      return saved;
    });
  }
  /** Owner resets any PIN. Any other user may change only their own and must give the current PIN. */
  changePin(actorId: string, targetId: string, newPin: string, currentPin?: string): Promise<UserAdminResult> {
    return this.perform(async (tx, now) => {
      const actor = await tx.users.get(actorId);
      if (!actor || !actor.isActive) throw new Rejected("forbidden", FORBIDDEN);
      const target = await this.requireTarget(tx, targetId);
      if (actor.role !== "owner") await this.checkSelf(tx, actor, target, currentPin ?? "", now);
      this.checkPin(newPin);
      const fresh = (await tx.users.get(targetId)) ?? target;
      const saved = { ...fresh, ...INITIAL_LOCKOUT, pinHash: await this.deps.hasher.hash(newPin), updatedAt: now };
      await tx.users.update(saved);
      await this.audit(tx, actorId, "user.change_pin", target, null, null, now);
      return saved;
    });
  }
  private async checkSelf(tx: AuthTx, actor: UserRecord, target: UserRecord, currentPin: string, now: string): Promise<void> {
    if (actor.id !== target.id) throw new Rejected("forbidden", FORBIDDEN);
    const nowMs = Date.parse(now);
    const attempt = await attemptPin(tx, this.deps.hasher, actor, currentPin, nowMs, this.deps.limits(), now);
    if (attempt.kind === "ok") return;
    // A wrong PIN must keep its counter, so report it without throwing.
    throw new KeepState(attempt.kind === "locked" ? "locked" : "wrong_pin", attempt.message);
  }
  private async perform(work: (tx: AuthTx, now: string) => Promise<UserRecord>): Promise<UserAdminResult> {
    try {
      const now = this.deps.clock.now().toISOString();
      const user = await this.deps.uow.transact((tx) => work(tx, now).catch((e: unknown) => keepOrThrow(e)));
      if ("rejected" in user) return { ok: false, ...user.rejected };
      return { ok: true, user };
    } catch (e) {
      if (e instanceof Rejected) return { ok: false, code: e.code, message: e.message, ...(e.rule ? { rule: e.rule } : {}) };
      return { ok: false, code: "failed", message: "Perubahan pengguna tidak tersimpan. Coba lagi." };
    }
  }
  private async requireOwner(tx: AuthTx, actorId: string): Promise<void> {
    const actor = await tx.users.get(actorId);
    if (!actor || !actor.isActive || actor.role !== "owner") throw new Rejected("forbidden", FORBIDDEN);
  }
  private async requireTarget(tx: AuthTx, id: string): Promise<UserRecord> {
    const target = await tx.users.get(id);
    if (!target) throw new Rejected("not_found", "Pengguna tidak ditemukan.");
    return target;
  }
  private async guardLastOwner(tx: AuthTx, target: UserRecord): Promise<void> {
    if (!target.isActive || target.role !== "owner") return;
    const owners = (await tx.users.list()).filter((u) => u.isActive && u.role === "owner");
    if (owners.length <= 1) throw new Rejected("last_owner", LAST_OWNER);
  }
  private async checkName(tx: AuthTx, name: string, selfId: string | null): Promise<string> {
    const others = (await tx.users.list()).filter((u) => u.isActive && u.id !== selfId).map((u) => u.displayName);
    const result = validateDisplayName(name, { maxLength: this.deps.limits().nameMaxLength }, others);
    if (!result.ok) throw new Rejected("invalid", result.message, result.rule);
    return name.trim();
  }
  private checkPin(pin: string): void {
    const { pinMinLength, pinMaxLength } = this.deps.limits();
    const result = validatePin(pin, { minLength: pinMinLength, maxLength: pinMaxLength });
    if (!result.ok) throw new Rejected("invalid", result.message, result.rule);
  }
  private audit(tx: AuthTx, actorId: string, action: string, target: UserRecord, before: unknown, after: unknown, now: string): Promise<void> {
    return tx.audit.append({
      id: this.deps.ids.next(), actorId, approverId: null, action, actionType: null,
      entityType: "user", entityId: target.id, before, after, reason: null, createdAt: now,
    });
  }
}
/** Carries a rejection that must still commit (the wrong-PIN counter). */
class KeepState extends Error {
  constructor(readonly code: UserAdminCode, message: string) {
    super(message);
  }
}
function keepOrThrow(e: unknown): { rejected: { code: UserAdminCode; message: string } } {
  if (e instanceof KeepState) return { rejected: { code: e.code, message: e.message } };
  throw e;
}
