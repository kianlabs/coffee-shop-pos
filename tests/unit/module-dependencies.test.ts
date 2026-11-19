import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  duplicateIdErrors,
  invalidIdErrors,
  migrationCollisionErrors,
  missingDependencyErrors,
  topologicalOrder,
  unknownSettingKeyErrors,
  validateModules,
} from "@/domain/modules/dependencies";
import type { ModuleDeclaration } from "@/domain/modules/types";
import type { SettingKey } from "@/domain/settings/definitions";

function mod(id: string, over: Partial<ModuleDeclaration> = {}): ModuleDeclaration {
  return { id, name: { id, en: id }, dependsOn: [], settingKeys: [], migrations: [], nav: [], ...over };
}
const step = (version: number) => ({ version, statements: [] });
const CORE = [1, 2, 3, 4, 5, 6, 7, 8];

describe("validasi id modul", () => {
  it("menolak id yang bukan kebab-case", () => {
    expect(invalidIdErrors([mod("fnb"), mod("kartu-member"), mod("v2")])).toEqual([]);
    expect(invalidIdErrors([mod("Fnb"), mod("kartu_member"), mod("-x"), mod("")])).toHaveLength(4);
  });
  it("menolak id ganda dan menyebut id itu sekali", () => {
    expect(duplicateIdErrors([mod("fnb"), mod("pelanggan")])).toEqual([]);
    const errors = duplicateIdErrors([mod("fnb"), mod("fnb"), mod("fnb")]);
    expect(errors).toEqual(['Id modul "fnb" dideklarasikan lebih dari sekali.']);
  });
});

describe("dependensi", () => {
  it("menolak dependensi yang tidak terdaftar", () => {
    const errors = missingDependencyErrors([mod("pelanggan", { dependsOn: ["fnb", "loyalti"] }), mod("fnb")]);
    expect(errors).toEqual(['Modul "pelanggan" bergantung pada modul "loyalti" yang tidak terdaftar.']);
  });
  it("urutan topologis menaruh dependensi lebih dulu", () => {
    const result = topologicalOrder([mod("a", { dependsOn: ["b", "c"] }), mod("b", { dependsOn: ["c"] }), mod("c")]);
    expect(result).toEqual({ order: ["c", "b", "a"] });
  });
  it("urutan stabil bila tidak ada dependensi", () => {
    expect(topologicalOrder([mod("x"), mod("y"), mod("z")])).toEqual({ order: ["x", "y", "z"] });
  });
  it("mendeteksi siklus dan jalurnya", () => {
    const result = topologicalOrder([mod("a", { dependsOn: ["b"] }), mod("b", { dependsOn: ["c"] }), mod("c", { dependsOn: ["a"] })]);
    expect(result).toEqual({ cycle: ["a", "b", "c", "a"] });
  });
  it("modul yang bergantung pada dirinya sendiri adalah siklus", () => {
    expect(topologicalOrder([mod("a", { dependsOn: ["a"] })])).toEqual({ cycle: ["a", "a"] });
  });
  it("properti: graf asiklik selalu menghasilkan urutan dengan dependensi lebih dulu", () => {
    // Module i may only depend on modules with a smaller index, so the graph is acyclic.
    const graph = fc.integer({ min: 1, max: 12 }).chain((n) =>
      fc.tuple(...Array.from({ length: n }, (_, i) => fc.subarray(Array.from({ length: i }, (_, j) => j)))),
    );
    fc.assert(
      fc.property(graph, fc.boolean(), (deps, reverse) => {
        const mods = deps.map((d, i) => mod(`m${i}`, { dependsOn: d.map((j) => `m${j}`) }));
        const result = topologicalOrder(reverse ? [...mods].reverse() : mods);
        if (!("order" in result)) return false;
        const pos = new Map(result.order.map((id, i) => [id, i]));
        return result.order.length === mods.length && mods.every((m) => m.dependsOn.every((d) => (pos.get(d) ?? Infinity) < (pos.get(m.id) ?? -1)));
      }),
    );
  });
});

describe("kunci pengaturan", () => {
  it("hanya menerima kunci yang terdaftar di Registry_Pengaturan", () => {
    expect(unknownSettingKeyErrors([mod("fnb", { settingKeys: ["tarif_bp", "lebar_kertas"] })])).toEqual([]);
    const errors = unknownSettingKeyErrors([mod("fnb", { settingKeys: ["tidak_ada" as SettingKey] })]);
    expect(errors).toEqual(['Modul "fnb" memakai kunci pengaturan "tidak_ada" yang tidak terdaftar.']);
  });
});

describe("versi migrasi", () => {
  it("lulus bila versi modul tidak dipakai inti atau modul lain", () => {
    expect(migrationCollisionErrors([mod("fnb", { migrations: [step(9)] }), mod("pelanggan", { migrations: [step(10)] })], CORE)).toEqual([]);
  });
  it("menolak versi yang dipakai migrasi inti", () => {
    expect(migrationCollisionErrors([mod("fnb", { migrations: [step(8)] })], CORE)).toEqual([
      'Versi migrasi 8 modul "fnb" bentrok dengan migrasi inti.',
    ]);
  });
  it("menolak versi yang dipakai modul lain atau berulang di modul yang sama", () => {
    const errors = migrationCollisionErrors(
      [mod("fnb", { migrations: [step(9), step(9)] }), mod("pelanggan", { migrations: [step(9)] })],
      CORE,
    );
    expect(errors).toEqual([
      'Versi migrasi 9 modul "fnb" bentrok dengan modul "fnb".',
      'Versi migrasi 9 modul "pelanggan" bentrok dengan modul "fnb".',
    ]);
  });
});

describe("validateModules", () => {
  it("mengembalikan urutan bila semua valid", () => {
    const result = validateModules([mod("pelanggan", { dependsOn: ["fnb"], migrations: [step(10)] }), mod("fnb", { migrations: [step(9)] })], CORE);
    expect(result).toEqual({ ok: true, order: ["fnb", "pelanggan"] });
  });
  it("tanpa modul tetap valid", () => {
    expect(validateModules([], CORE)).toEqual({ ok: true, order: [] });
  });
  it("mengumpulkan setiap kegagalan", () => {
    const result = validateModules(
      [
        mod("Fnb", { settingKeys: ["x" as SettingKey], migrations: [step(1)] }),
        mod("a", { dependsOn: ["b", "hilang"] }),
        mod("b", { dependsOn: ["a"] }),
        mod("b"),
      ],
      CORE,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(6);
    expect(result.errors.join("\n")).toMatch(/kebab-case/);
    expect(result.errors.join("\n")).toMatch(/lebih dari sekali/);
    expect(result.errors.join("\n")).toMatch(/"hilang" yang tidak terdaftar/);
    expect(result.errors.join("\n")).toMatch(/kunci pengaturan "x"/);
    expect(result.errors.join("\n")).toMatch(/migrasi inti/);
    expect(result.errors.join("\n")).toMatch(/melingkar: a → b → a/);
  });
});
