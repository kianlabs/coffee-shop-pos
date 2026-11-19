import { CROSS_RULES, settingByKey, type SettingDefinition, type SettingKey, type SettingValues } from "@/domain/settings/definitions";
import { validateCross, validateValue } from "@/domain/settings/validate";

export type SettingsErrorCode = "forbidden" | "unknown_key" | "invalid" | "audit_failed" | "save_failed";
export type SettingsResult =
  | { ok: true; changed: SettingKey[] }
  | { ok: false; code: SettingsErrorCode; message: string };

export const MESSAGES = {
  forbidden: "Hanya owner yang dapat mengubah pengaturan.",
  auditFailed: "Pengaturan tidak tersimpan karena gagal dicatat di log audit.",
  saveFailed: "Pengaturan tidak tersimpan. Coba lagi.",
} as const;

/** One planned row change. `reset` deletes the row so the registry default applies. */
export interface Change {
  def: SettingDefinition;
  before: unknown;
  after: unknown;
  reset: boolean;
}

export function fail(code: SettingsErrorCode, message: string): SettingsResult {
  return { ok: false, code, message };
}

/** Values are JSON data, so JSON text equality is value equality. */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Validates a patch against the registry and the cross-key rules on the merged values. */
export function planSet(current: SettingValues, patch: Readonly<Record<string, unknown>>): Change[] | SettingsResult {
  const changes: Change[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const def = settingByKey(key);
    if (!def) return fail("unknown_key", `Pengaturan "${key}" tidak terdaftar.`);
    const error = validateValue(def, value);
    if (error) return fail("invalid", error);
    const before = current[def.key];
    if (!sameValue(before, value)) changes.push({ def, before, after: value, reset: false });
  }
  const cross = validateCross(CROSS_RULES, merge(current, changes));
  return cross ? fail("invalid", cross) : changes;
}

/** Plans a reset of every key to its registry default. Rows are removed even when the value is unchanged. */
export function planReset(current: SettingValues, keys: readonly string[]): Change[] | SettingsResult {
  const changes: Change[] = [];
  for (const key of new Set(keys)) {
    const def = settingByKey(key);
    if (!def) return fail("unknown_key", `Pengaturan "${key}" tidak terdaftar.`);
    changes.push({ def, before: current[def.key], after: def.default, reset: true });
  }
  const cross = validateCross(CROSS_RULES, merge(current, changes));
  return cross ? fail("invalid", cross) : changes;
}

export function merge(current: SettingValues, changes: readonly Change[]): SettingValues {
  const next: Record<string, unknown> = { ...current };
  for (const c of changes) next[c.def.key] = c.after;
  return next as SettingValues;
}

/**
 * Builds the cache from stored rows. Unknown keys are ignored; a stored value that is
 * invalid, or that would break a cross-key rule, is skipped so its default stays.
 */
export function valuesFromRows(defaults: SettingValues, rows: readonly { key: string; value: unknown }[]): SettingValues {
  let values = defaults;
  for (const row of rows) {
    const def = settingByKey(row.key);
    if (!def || validateValue(def, row.value) !== null) continue;
    const next = merge(values, [{ def, before: values[def.key], after: row.value, reset: false }]);
    if (validateCross(CROSS_RULES, next) === null) values = next;
  }
  return values;
}
