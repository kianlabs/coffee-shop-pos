import { createLegacySettingsImport } from "@/data/legacySettingsImport";
import type { DataHook } from "@/data/migration/runner";
import type { HookInputs, LegacyKey } from "./inputs";
import { createLegacyOwnerHook } from "./legacyOwner";
export type { HookInputs, LegacyInputs, LegacyKey } from "./inputs";
export interface MigrationHooks {
  hooks: Record<string, DataHook>;
  /** Run after every pending version committed: removes legacy localStorage keys that were imported. */
  afterCommit: Array<() => Promise<void>>;
}
/** Registers every named hook used by MIGRATION_STEPS. `inputs` carries the legacy strings. */
export function createMigrationHooks(inputs: HookInputs): MigrationHooks {
  const imported = new Set<LegacyKey>();
  const settings = createLegacySettingsImport({
    read: () => inputs.legacy.settings,
    clear: () => inputs.clear?.("settings"),
    now: inputs.now,
  });
  const hooks: Record<string, DataHook> = {
    legacy_settings: settings.hook,
    legacy_owner: createLegacyOwnerHook(inputs),
  };
  const afterCommit = [
    settings.afterCommit,
    async () => {
      for (const key of imported) inputs.clear?.(key);
      imported.clear();
    },
  ];
  return { hooks, afterCommit };
}
