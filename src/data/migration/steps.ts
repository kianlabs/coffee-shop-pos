import {
  UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8,
  UPGRADE_V9, UPGRADE_V10, UPGRADE_V11, UPGRADE_V12, UPGRADE_V13, UPGRADE_V14,
  UPGRADE_V15, UPGRADE_V16, UPGRADE_V17, UPGRADE_V18,
} from "@/data/migrations";
import type { MigrationStep } from "@/domain/migration";
/**
 * Every schema step in order. V15..V17 belong to modules (`fnb`, `pelanggan`, `fnb`) and are declared there
 * too (`src/modules/<id>/migrations`); a test keeps both lists identical. They always run, even for a disabled
 * module (design D3), because the schema must not depend on which modules are on.
 * Named hooks are registered by `createMigrationHooks`. */
export const MIGRATION_STEPS: readonly MigrationStep[] = [
  { version: 1, statements: UPGRADE_V1 },
  { version: 2, statements: UPGRADE_V2 },
  { version: 3, statements: UPGRADE_V3 },
  { version: 4, statements: UPGRADE_V4 },
  { version: 5, statements: UPGRADE_V5 },
  { version: 6, statements: UPGRADE_V6 },
  { version: 7, statements: UPGRADE_V7 },
  { version: 8, statements: UPGRADE_V8, hook: "legacy_settings" },
  { version: 9, statements: UPGRADE_V9, hook: "legacy_owner" },
  { version: 10, statements: UPGRADE_V10, hook: "legacy_cart_shift_held" },
  { version: 11, statements: UPGRADE_V11, hook: "milli_stock" },
  { version: 12, statements: UPGRADE_V12, hook: "orders_refunds" },
  { version: 13, statements: UPGRADE_V13 },
  { version: 14, statements: UPGRADE_V14, hook: "legacy_printer" },
  { version: 15, statements: UPGRADE_V15 },
  { version: 16, statements: UPGRADE_V16 },
  { version: 17, statements: UPGRADE_V17 },
  { version: 18, statements: UPGRADE_V18 },
];
export const LATEST_VERSION = MIGRATION_STEPS.length;
/** Versions owned by modules; every other version is core and is what modules must not reuse. */
export const MODULE_MIGRATION_VERSIONS: readonly number[] = [15, 16, 17];
export const CORE_MIGRATION_VERSIONS: readonly number[] = MIGRATION_STEPS.map((s) => s.version).filter(
  (v) => !MODULE_MIGRATION_VERSIONS.includes(v),
);
