import {
  UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8,
  UPGRADE_V9, UPGRADE_V10, UPGRADE_V11, UPGRADE_V12, UPGRADE_V13,
} from "@/data/migrations";
import type { MigrationStep } from "@/domain/migration";
/** Every schema step in order. Named hooks are registered by `createMigrationHooks`. */
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
];
export const LATEST_VERSION = MIGRATION_STEPS.length;
