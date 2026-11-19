import { canApprove, decide, isRole, type Role, type SensitiveAction } from "@/domain/permissions";
import { attemptPin } from "./authPin";
import type { Clock, Ids } from "./ports";
import type { AuditStore } from "./ports/settings";
import type { AuthTx, PinHasher, SecurityLimits } from "./ports/users";
export interface ApproverInput {
  userId: string;
  pin: string;
}
export interface AuthorizeRequest {
  action: SensitiveAction;
  /** User who triggers the action. Their role is read from storage, not from the caller. */
  actorId: string;
  /** Needed when the actor's role is below the minimum for the action. */
  approver?: ApproverInput;
}
/** Proof that the action may run. Issued by `authorize`, consumed by `record` or `execute`. */
export interface Authorization {
  readonly action: SensitiveAction;
  readonly actorId: string;
  readonly actorRole: Role;
  /** Null when the actor's own role is enough. */
  readonly approverId: string | null;
}
export type AuthorizeCode = "actor_invalid" | "approver_required" | "approver_invalid" | "approver_role" | "wrong_pin" | "locked" | "failed";
export type AuthorizeResult =
  | { ok: true; authorization: Authorization }
  | { ok: false; code: AuthorizeCode; message: string; remainingAttempts?: number; remainingLockMs?: number };
export interface AuditDetails {
  /** Audit `action`, for example `order.refund`. */
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  /** Empty or missing when the action asks for no reason. */
  reason?: string | null;
}
export type RunResult<R> = { ok: true; value: R } | { ok: false; code: "audit_failed"; message: string };
export interface GuardUnitOfWork<T extends AuthTx> {
  transact<R>(fn: (tx: T) => Promise<R>): Promise<R>;
}
export interface SensitiveGuardDeps<T extends AuthTx> {
  uow: GuardUnitOfWork<T>;
  hasher: PinHasher;
  clock: Clock;
  ids: Ids;
  limits: () => SecurityLimits;
}
const AUDIT_FAILED = "Aksi tidak dijalankan karena gagal dicatat di log audit.";
const fail = (code: AuthorizeCode, message: string): AuthorizeResult => ({ ok: false, code, message });
class AuditFailure extends Error {}
/**
 * Authorizes sensitive actions and writes their audit row (Req 1.6, 1.13, 20.2, 20.9).
 * Step 1, `authorize`, checks roles and the approver PIN in its own transaction so a wrong
 * PIN keeps its counter. Step 2, `record` or `execute`, writes the audit row in the transaction of the
 * action it protects, so an audit failure rolls the action back.
 */
export class SensitiveActionGuard<T extends AuthTx = AuthTx> {
  private readonly issued = new WeakSet<Authorization>();
  constructor(private readonly deps: SensitiveGuardDeps<T>) {}
  async authorize(req: AuthorizeRequest): Promise<AuthorizeResult> {
    try {
      const nowDate = this.deps.clock.now();
      return await this.deps.uow.transact(async (tx) => {
        const actor = await tx.users.get(req.actorId);
        if (!actor || !actor.isActive || !isRole(actor.role)) return fail("actor_invalid", "Pengguna tidak ditemukan atau nonaktif.");
        const base = { action: req.action, actorId: actor.id, actorRole: actor.role };
        if (decide(actor.role, req.action) === "allow") return this.issue({ ...base, approverId: null });
        if (!req.approver) return fail("approver_required", "Aksi ini memerlukan persetujuan supervisor atau owner.");
        const approver = await tx.users.get(req.approver.userId);
        if (!approver || !approver.isActive) return fail("approver_invalid", "Penyetuju tidak ditemukan atau nonaktif.");
        if (!canApprove(approver.role, req.action)) return fail("approver_role", "Penyetuju tidak punya peran yang cukup untuk aksi ini.");
        const attempt = await attemptPin(tx, this.deps.hasher, approver, req.approver.pin, nowDate.getTime(), this.deps.limits(), nowDate.toISOString());
        if (attempt.kind === "ok") return this.issue({ ...base, approverId: approver.id });
        if (attempt.kind === "locked") return { ok: false, code: "locked", message: attempt.message, remainingLockMs: attempt.remainingMs };
        return { ok: false, code: "wrong_pin", message: attempt.message, remainingAttempts: attempt.remaining };
      });
    } catch {
      return fail("failed", "Otorisasi gagal. Coba lagi.");
    }
  }
  /** Appends the audit row inside `tx`. Throws when the authorization was not issued here or the append fails. */
  async record(tx: { audit: AuditStore }, auth: Authorization, details: AuditDetails): Promise<void> {
    if (!this.issued.has(auth)) throw new Error("Otorisasi tidak dikenal.");
    const reason = details.reason?.trim() ?? "";
    await tx.audit.append({
      id: this.deps.ids.next(),
      actorId: auth.actorId,
      approverId: auth.approverId,
      action: details.action,
      actionType: auth.action,
      entityType: details.entityType,
      entityId: details.entityId,
      before: details.before,
      after: details.after,
      reason: reason === "" ? null : reason,
      createdAt: this.deps.clock.now().toISOString(),
    });
  }
  /** Runs `work` and the audit append in one transaction. A failed append undoes `work`. */
  async execute<R>(auth: Authorization, details: AuditDetails, work: (tx: T) => Promise<R>): Promise<RunResult<R>> {
    try {
      const value = await this.deps.uow.transact(async (tx) => {
        const result = await work(tx);
        await this.record(tx, auth, details).catch(() => {
          throw new AuditFailure();
        });
        return result;
      });
      return { ok: true, value };
    } catch (e) {
      if (e instanceof AuditFailure) return { ok: false, code: "audit_failed", message: AUDIT_FAILED };
      throw e;
    }
  }
  private issue(auth: Authorization): AuthorizeResult {
    this.issued.add(auth);
    return { ok: true, authorization: auth };
  }
}
