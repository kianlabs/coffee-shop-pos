import { defaultSettings, type SettingKey, type SettingValue, type SettingValues } from "@/domain/settings/definitions";
import type { Clock, Ids, Tx, UnitOfWork } from "./ports";
import { MESSAGES, fail, merge, planReset, planSet, sameValue, valuesFromRows, type Change, type SettingsResult } from "./settingsChanges";

export type { SettingsErrorCode, SettingsResult } from "./settingsChanges";

export interface SettingsActor {
  id: string;
  role: "owner" | "supervisor" | "kasir";
}

export type SettingsListener = (changed: readonly SettingKey[], values: Readonly<SettingValues>) => void;

export interface SettingsServiceDeps {
  uow: UnitOfWork;
  clock: Clock;
  ids: Ids;
}

/** Thrown inside the transaction so the change rolls back (Req 28.8). */
class AuditFailure extends Error {}

/**
 * Typed settings with a synchronous cache. Writes are owner-only, validated against
 * the registry, and committed together with their audit rows in one transaction.
 */
export class SettingsService {
  private values: SettingValues = defaultSettings();
  private readonly listeners = new Set<SettingsListener>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: SettingsServiceDeps) {}

  get<K extends SettingKey>(key: K): SettingValue<K> {
    return this.values[key];
  }

  snapshot(): Readonly<SettingValues> {
    return this.values;
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Loads every stored value into the cache. Call once at boot. */
  load(): Promise<void> {
    return this.exclusive(async () => {
      const rows = await this.deps.uow.transact((tx) => tx.settings.loadAll());
      this.values = valuesFromRows(defaultSettings(), rows);
      this.publish(Object.keys(this.values) as SettingKey[]);
    });
  }

  set<K extends SettingKey>(key: K, value: SettingValue<K>, actor: SettingsActor): Promise<SettingsResult> {
    return this.setMany({ [key]: value }, actor);
  }

  /** Saves several values at once, so a min/max pair can move together. */
  setMany(patch: Readonly<Record<string, unknown>>, actor: SettingsActor): Promise<SettingsResult> {
    return this.exclusive(() => {
      if (actor.role !== "owner") return Promise.resolve(fail("forbidden", MESSAGES.forbidden));
      const plan = planSet(this.values, patch);
      return Array.isArray(plan) ? this.commit(plan, actor, "setting.update") : Promise.resolve(plan);
    });
  }

  /** Resets the given keys to their registry defaults in one transaction. */
  reset(keys: readonly string[], actor: SettingsActor): Promise<SettingsResult> {
    return this.exclusive(() => {
      if (actor.role !== "owner") return Promise.resolve(fail("forbidden", MESSAGES.forbidden));
      const plan = planReset(this.values, keys);
      return Array.isArray(plan) ? this.commit(plan, actor, "setting.reset") : Promise.resolve(plan);
    });
  }

  private async commit(changes: Change[], actor: SettingsActor, action: string): Promise<SettingsResult> {
    if (changes.length === 0) return { ok: true, changed: [] };
    const now = this.deps.clock.now().toISOString();
    try {
      await this.deps.uow.transact(async (tx) => {
        for (const change of changes) await this.write(tx, change, actor, action, now);
      });
    } catch (e) {
      return fail(e instanceof AuditFailure ? "audit_failed" : "save_failed", e instanceof AuditFailure ? MESSAGES.auditFailed : MESSAGES.saveFailed);
    }
    const changed = changes.filter((c) => !sameValue(c.before, c.after)).map((c) => c.def.key);
    this.values = merge(this.values, changes);
    this.publish(changed);
    return { ok: true, changed };
  }

  private async write(tx: Tx, change: Change, actor: SettingsActor, action: string, now: string): Promise<void> {
    const { def } = change;
    if (change.reset) await tx.settings.remove(def.key);
    else await tx.settings.put({ key: def.key, value: change.after, updatedAt: now, updatedBy: actor.id });
    if (!def.auditable || sameValue(change.before, change.after)) return;
    try {
      await tx.audit.append({
        id: this.deps.ids.next(),
        actorId: actor.id,
        approverId: null,
        action,
        actionType: def.group === "keamanan" ? "change_security_setting" : "change_setting",
        entityType: "setting",
        entityId: def.key,
        before: change.before,
        after: change.after,
        reason: null,
        createdAt: now,
      });
    } catch (e) {
      throw new AuditFailure("audit append failed", { cause: e });
    }
  }

  private publish(changed: readonly SettingKey[]): void {
    if (changed.length === 0) return;
    for (const listener of this.listeners) {
      try {
        listener(changed, this.values);
      } catch {
        // A broken subscriber must not turn a committed change into a failure.
      }
    }
  }

  /** Runs operations one at a time so each plan sees the result of the previous commit. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
