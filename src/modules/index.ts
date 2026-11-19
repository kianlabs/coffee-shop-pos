/**
 * Only `src/main.tsx` imports this file (check-boundaries enforces it). Each module lives in
 * `src/modules/<id>/module.ts` and default-exports its `ModuleDeclaration`.
 */
import type { ModuleDeclaration } from "@/domain/modules/types";
import type { MigrationStep } from "@/domain/migration";
import type { ModuleRegistry } from "@/services/moduleRegistry";
type Declaration = ModuleDeclaration<Partial<Record<string, unknown>>>;
const files = import.meta.glob<{ default?: unknown }>("./*/module.ts", { eager: true });
function isDeclaration(value: unknown): value is Declaration {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && Array.isArray(v.dependsOn) && Array.isArray(v.migrations) && Array.isArray(v.nav);
}
export interface LoadedModules {
  declarations: Declaration[];
  /** Module migration steps to pass as extra steps to the migration runner. */
  migrations: MigrationStep[];
}
/**
 * Registers every discovered module and validates the set. Throws with the Indonesian error list
 * when a declaration is invalid. With no modules present it does nothing.
 */
export function registerModules(registry: ModuleRegistry, coreVersions: readonly number[]): LoadedModules {
  const declarations: Declaration[] = [];
  for (const [path, mod] of Object.entries(files)) {
    if (!isDeclaration(mod.default)) throw new Error(`${path} harus mengekspor ModuleDeclaration sebagai default.`);
    declarations.push(mod.default);
  }
  for (const decl of declarations) registry.register(decl);
  const result = registry.validate(coreVersions);
  if (!result.ok) throw new Error(`Modul tidak valid:\n${result.errors.join("\n")}`);
  return { declarations, migrations: declarations.flatMap((d) => [...d.migrations]) };
}
