import { describe, expect, it } from "vitest";
import fc from "fast-check";
import id from "@/locales/id.json";
import { applyPreset, BUSINESS_TYPE_OPTIONS, PRESETS, type PresetPlan } from "@/domain/presets";
import { settingByKey } from "@/domain/settings/definitions";
import { validateValue } from "@/domain/settings/validate";

function planOf(type: string, known: readonly string[] = []): PresetPlan {
  const result = applyPreset(type, known);
  if (!result.ok) throw new Error(result.error);
  return result.plan;
}
const AVAILABLE = ["fnb_kafe", "fnb_resto", "fnb_warung", "lainnya"] as const;

describe("pilihan jenis usaha", () => {
  it("empat pilihan aktif lalu retail dan jasa berlabel segera hadir", () => {
    expect(BUSINESS_TYPE_OPTIONS.filter((o) => o.available).map((o) => o.id)).toEqual(AVAILABLE);
    const soon = BUSINESS_TYPE_OPTIONS.filter((o) => !o.available);
    expect(soon.map((o) => o.id)).toEqual(["retail", "jasa"]);
    expect(soon.every((o) => o.badge?.id === "Segera hadir")).toBe(true);
  });
  it("retail dan jasa ditolak, jenis tak dikenal ditolak", () => {
    expect(applyPreset("retail", [])).toEqual({ ok: false, error: 'Jenis usaha "Retail / toko" segera hadir.' });
    expect(applyPreset("jasa", [])).toMatchObject({ ok: false, error: expect.stringMatching(/segera hadir/) });
    expect(applyPreset("toString", [])).toEqual({ ok: false, error: 'Jenis usaha "toString" tidak dikenal.' });
  });
});

describe("isi preset", () => {
  it("setiap nilai pengaturan preset terdaftar dan valid", () => {
    for (const preset of Object.values(PRESETS)) {
      for (const [key, value] of Object.entries(preset.settings)) {
        const def = settingByKey(key);
        expect(def, key).toBeDefined();
        if (def) expect(validateValue(def, value), key).toBeNull();
      }
    }
  });
  it("setiap kunci label ada di katalog i18n", () => {
    const keys = Object.values(PRESETS).flatMap((p) => Object.keys(p.labels));
    for (const key of keys) expect(Object.hasOwn(id, key), key).toBe(true);
  });
  it("fnb_* mengaktifkan fnb, lainnya tanpa modul", () => {
    expect(planOf("fnb_kafe").modules).toEqual([{ id: "fnb", enabled: true }]);
    expect(planOf("fnb_resto").modules).toEqual([{ id: "fnb", enabled: true }]);
    expect(planOf("fnb_warung").modules).toEqual([{ id: "fnb", enabled: true }]);
    expect(planOf("lainnya").modules).toEqual([]);
  });
  it("modul terdaftar di luar preset dinonaktifkan", () => {
    expect(planOf("lainnya", ["fnb", "pelanggan"]).modules).toEqual([
      { id: "fnb", enabled: false },
      { id: "pelanggan", enabled: false },
    ]);
    expect(planOf("fnb_kafe", ["pelanggan", "fnb"]).modules).toEqual([
      { id: "pelanggan", enabled: false },
      { id: "fnb", enabled: true },
    ]);
  });
  it("berpindah preset mengembalikan kunci yang dikelola ke default", () => {
    const resto = new Map(planOf("fnb_resto").settings.map((s) => [s.key, s.value]));
    const kafe = new Map(planOf("fnb_kafe").settings.map((s) => [s.key, s.value]));
    expect(resto.get("pajak.biaya_layanan_aktif")).toBe(true);
    expect(kafe.get("pajak.biaya_layanan_aktif")).toBe(false);
    expect(kafe.get("pajak.mode")).toBe("off");
    expect([...kafe.keys()]).toEqual([...resto.keys()]);
  });
  it("label lainnya dihapus saat beralih ke preset fnb", () => {
    expect(planOf("lainnya").labels).toContainEqual({ key: "app.nav.menu", value: { id: "Produk", en: "Products" } });
    expect(planOf("fnb_kafe").labels).toContainEqual({ key: "app.nav.menu", value: null });
  });
});

describe("applyPreset hanya merencanakan modules, app_settings, dan label", () => {
  it("properti: rencana tidak memuat target selain modules, settings, dan labels", () => {
    const known = fc.uniqueArray(fc.stringMatching(/^[a-z]{1,8}$/), { maxLength: 6 });
    fc.assert(
      fc.property(fc.constantFrom(...AVAILABLE), known, (type, ids) => {
        const plan = planOf(type, ids);
        expect(Object.keys(plan).sort()).toEqual(["businessType", "labels", "modules", "settings"]);
        expect(plan.settings.every((s) => settingByKey(s.key) !== undefined)).toBe(true);
        expect(plan.businessType).toBe(type);
      }),
    );
  });
  it("murni: input yang sama memberi rencana yang sama", () => {
    for (const type of AVAILABLE) expect(planOf(type, ["fnb"])).toEqual(planOf(type, ["fnb"]));
  });
});
