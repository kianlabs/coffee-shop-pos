import type { Clock, Ids } from "./ports";
import type { ModuleUnitOfWork } from "./ports/modules";
import type { ModuleRegistry } from "./moduleRegistry";
export interface ModuleActor {
  id: string;
  role: "owner" | "supervisor" | "kasir";
}
export type ModuleErrorCode = "forbidden" | "not_found" | "missing_dependencies" | "has_dependents" | "confirm_required" | "save_failed";
export type ModuleResult = { ok: true; changed: boolean } | { ok: false; code: ModuleErrorCode; message: string; modules?: string[] };
export interface ModuleServiceDeps {
  uow: ModuleUnitOfWork;
  registry: ModuleRegistry;
  clock: Clock;
  ids: Ids;
  /** True when the module has stored data; disabling then needs owner confirmation (Req 29.5). */
  hasData?: (moduleId: string) => Promise<boolean>;
}
const fail = (code: ModuleErrorCode, message: string, modules?: string[]): ModuleResult => ({ ok: false, code, message, modules });
/**
 * Enables and disables modules. Only owners may change them. Disabling writes an audit row in the
 * same transaction as the flag and keeps the module's data in place (Req 29.4, 29.5, 29.7).
 */
export class ModuleService {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly deps: ModuleServiceDeps) {}
  /** Reads stored flags into the registry. Call once at boot. */
  load(): Promise<void> {
    return this.exclusive(async () => {
      const rows = await this.deps.uow.transact((tx) => tx.modules.loadAll());
      this.deps.registry.setActive(rows.filter((r) => r.enabled).map((r) => r.id));
    });
  }
  enable(id: string, actor: ModuleActor): Promise<ModuleResult> {
    return this.exclusive(async () => {
      const denied = this.check(id, actor);
      if (denied) return denied;
      const { registry } = this.deps;
      if (registry.isActive(id)) return { ok: true, changed: false };
      const missing = (registry.get(id)?.dependsOn ?? []).filter((dep) => !registry.isActive(dep));
      if (missing.length > 0) {
        const names = missing.map((m) => registry.get(m)?.name.id ?? m);
        return fail("missing_dependencies", `Aktifkan dulu modul: ${names.join(", ")}.`, missing);
      }
      return this.commit(id, actor, true);
    });
  }
  /** `confirmed` must be true when the module has data; otherwise the result is `confirm_required`. */
  disable(id: string, actor: ModuleActor, confirmed = false): Promise<ModuleResult> {
    return this.exclusive(async () => {
      const denied = this.check(id, actor);
      if (denied) return denied;
      const { registry } = this.deps;
      if (!registry.isActive(id)) return { ok: true, changed: false };
      const dependents = registry.activeIds().filter((o) => registry.get(o)?.dependsOn.includes(id));
      if (dependents.length > 0) {
        const names = dependents.map((d) => registry.get(d)?.name.id ?? d);
        return fail("has_dependents", `Nonaktifkan dulu modul yang bergantung: ${names.join(", ")}.`, dependents);
      }
      if (!confirmed && (await this.deps.hasData?.(id))) {
        return fail("confirm_required", "Modul ini memiliki data. Data tetap tersimpan, tetapi fitur disembunyikan. Konfirmasi untuk menonaktifkan.");
      }
      return this.commit(id, actor, false);
    });
  }
  private check(id: string, actor: ModuleActor): ModuleResult | null {
    if (actor.role !== "owner") return fail("forbidden", "Hanya owner yang dapat mengubah modul.");
    if (!this.deps.registry.get(id)) return fail("not_found", `Modul "${id}" tidak terdaftar.`);
    return null;
  }
  private async commit(id: string, actor: ModuleActor, enabled: boolean): Promise<ModuleResult> {
    const { registry, clock, ids } = this.deps;
    const now = clock.now().toISOString();
    try {
      await this.deps.uow.transact(async (tx) => {
        await tx.modules.put({ id, enabled, enabledAt: enabled ? now : null, updatedBy: actor.id });
        if (enabled) return;
        await tx.audit.append({
          id: ids.next(),
          actorId: actor.id,
          approverId: null,
          action: "module.disable",
          actionType: null,
          entityType: "module",
          entityId: id,
          before: { enabled: true },
          after: { enabled: false },
          reason: null,
          createdAt: now,
        });
      });
    } catch {
      return fail("save_failed", "Perubahan modul tidak tersimpan.");
    }
    const next = new Set(registry.activeIds());
    if (enabled) next.add(id);
    else next.delete(id);
    registry.setActive(next);
    return { ok: true, changed: true };
  }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
