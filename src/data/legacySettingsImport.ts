import { mapLegacySettings } from "@/domain/settings/legacyImport";
import type { DataHook } from "./migration/runner";
import { writeInTx } from "./tx";
/** Insert only when the key is absent, so re-running never overwrites a value the owner already set. */
const INSERT_IF_ABSENT = `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
  ON CONFLICT(key) DO NOTHING`;
export const LEGACY_IMPORT_ACTOR = "migrasi";
export interface LegacyImportDeps {
  /** Returns the raw `pos.settings.v1` text, or null when absent. */
  read(): string | null;
  /** Removes the legacy key. */
  clear(): void;
  now(): string;
}
function parse(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
/**
 * Data hook for a migration step plus its `afterCommit` cleanup. The hook copies mapped values
 * into `app_settings` inside the migration transaction; the localStorage key is removed only
 * after the whole migration committed (so a rollback keeps the legacy data).
 */
export function createLegacySettingsImport(deps: LegacyImportDeps): { hook: DataHook; afterCommit: () => Promise<void> } {
  let imported = false;
  const hook: DataHook = async (db) => {
    const parsed = parse(deps.read());
    if (parsed === undefined) return;
    const plan = mapLegacySettings(parsed);
    const now = deps.now();
    for (const [key, value] of Object.entries(plan.values)) {
      await writeInTx(db, INSERT_IF_ABSENT, [key, JSON.stringify(value), now, LEGACY_IMPORT_ACTOR]);
    }
    imported = true;
  };
  const afterCommit = async (): Promise<void> => {
    if (!imported) return;
    imported = false;
    deps.clear();
  };
  return { hook, afterCommit };
}
