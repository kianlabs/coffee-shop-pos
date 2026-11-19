/**
 * Boot-time validation of module declarations (Req 29.6–29.8). Pure.
 * Every check returns Indonesian error messages; an empty list means valid.
 */
import { settingByKey } from "../settings/definitions";
import type { ModuleDeclaration, ModuleValidation } from "./types";

type Decl = Pick<ModuleDeclaration, "id" | "dependsOn" | "settingKeys" | "migrations">;

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function invalidIdErrors(modules: readonly Decl[]): string[] {
  return modules
    .filter((m) => !KEBAB_CASE.test(m.id))
    .map((m) => `Id modul "${m.id}" harus kebab-case (huruf kecil, angka, tanda hubung).`);
}

export function duplicateIdErrors(modules: readonly Decl[]): string[] {
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const m of modules) {
    if (seen.has(m.id)) reported.add(m.id);
    seen.add(m.id);
  }
  return [...reported].map((id) => `Id modul "${id}" dideklarasikan lebih dari sekali.`);
}

export function missingDependencyErrors(modules: readonly Decl[]): string[] {
  const ids = new Set(modules.map((m) => m.id));
  return modules.flatMap((m) =>
    m.dependsOn
      .filter((dep) => !ids.has(dep))
      .map((dep) => `Modul "${m.id}" bergantung pada modul "${dep}" yang tidak terdaftar.`),
  );
}

/**
 * Dependencies-first order (stable: follows declaration order otherwise).
 * Unknown dependencies are skipped; `missingDependencyErrors` reports them.
 * Returns the first cycle found as a path whose first and last ids are equal.
 */
export function topologicalOrder(modules: readonly Decl[]): { order: string[] } | { cycle: string[] } {
  // First declaration wins; duplicates are reported by duplicateIdErrors.
  const byId = new Map<string, Decl>();
  for (const m of modules) if (!byId.has(m.id)) byId.set(m.id, m);
  const done = new Set<string>();
  const order: string[] = [];
  const visit = (id: string, path: string[]): string[] | null => {
    if (done.has(id)) return null;
    const at = path.indexOf(id);
    if (at >= 0) return [...path.slice(at), id];
    const mod = byId.get(id);
    if (!mod) return null;
    for (const dep of mod.dependsOn) {
      const cycle = visit(dep, [...path, id]);
      if (cycle) return cycle;
    }
    done.add(id);
    order.push(id);
    return null;
  };
  for (const m of modules) {
    const cycle = visit(m.id, []);
    if (cycle) return { cycle };
  }
  return { order };
}

export function unknownSettingKeyErrors(modules: readonly Decl[]): string[] {
  return modules.flatMap((m) =>
    m.settingKeys
      .filter((key) => settingByKey(key) === undefined)
      .map((key) => `Modul "${m.id}" memakai kunci pengaturan "${key}" yang tidak terdaftar.`),
  );
}

/** Module migration versions must not repeat and must not reuse a core version. */
export function migrationCollisionErrors(modules: readonly Decl[], coreVersions: readonly number[]): string[] {
  const owner = new Map<number, string>(coreVersions.map((v) => [v, "inti"]));
  const errors: string[] = [];
  for (const m of modules) {
    for (const step of m.migrations) {
      const taken = owner.get(step.version);
      if (taken !== undefined) {
        errors.push(`Versi migrasi ${step.version} modul "${m.id}" bentrok dengan ${describeOwner(taken)}.`);
        continue;
      }
      owner.set(step.version, m.id);
    }
  }
  return errors;
}

function describeOwner(owner: string): string {
  return owner === "inti" ? "migrasi inti" : `modul "${owner}"`;
}

/** Runs every check. On success returns the activation/registration order. */
export function validateModules(modules: readonly Decl[], coreVersions: readonly number[]): ModuleValidation {
  const errors = [
    ...invalidIdErrors(modules),
    ...duplicateIdErrors(modules),
    ...missingDependencyErrors(modules),
    ...unknownSettingKeyErrors(modules),
    ...migrationCollisionErrors(modules, coreVersions),
  ];
  const sorted = topologicalOrder(modules);
  if ("cycle" in sorted) errors.push(`Dependensi modul melingkar: ${sorted.cycle.join(" → ")}.`);
  if (errors.length > 0 || "cycle" in sorted) return { ok: false, errors };
  return { ok: true, order: sorted.order };
}
