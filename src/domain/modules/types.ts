import type { MigrationStep } from "../migration";
import type { SettingKey } from "../settings/definitions";

export type ModuleRole = "owner" | "supervisor" | "kasir";

/** Navigation entry a module contributes. `icon` is a name resolved by the UI layer. */
export interface ModuleNavItem {
  id: string;
  icon: string;
  /** i18n key for the label. */
  labelKey: string;
  route: string;
  minRole: ModuleRole;
}

/**
 * What every module declares (Req 29.6). Slot contributions are UI types, so the
 * domain leaves them generic; the registry in `src/services` narrows `S`.
 */
export interface ModuleDeclaration<S = unknown> {
  /** Unique, kebab-case. */
  id: string;
  name: { id: string; en: string };
  dependsOn: readonly string[];
  /** Must be registered in `src/domain/settings/definitions`. */
  settingKeys: readonly SettingKey[];
  /** Contributed to the global migration chain; versions must not collide. */
  migrations: readonly MigrationStep[];
  nav: readonly ModuleNavItem[];
  slots?: S;
}

/** Result of validating a set of module declarations at boot. */
export type ModuleValidation =
  | { ok: true; order: string[] }
  | { ok: false; errors: string[] };
