// Property 21: Settings validation and reset. Validates: Requirements 28.2, 28.5, 28.9, 28.12
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CROSS_RULES, SETTINGS, defaultSettings, type SettingDefinition } from "@/domain/settings/definitions";
import { validateCross, validateValue } from "@/domain/settings/validate";
import { SettingsService } from "@/services/settingsService";
import { createMemorySettingsDb, fixedClock, sequentialIds } from "@/testing/memory/settings";

const owner = { id: "owner", role: "owner" } as const;
const PAIRS = [
  ["keamanan.pin_panjang_min", "keamanan.pin_panjang_maks"],
  ["sinkronisasi.jeda_dasar_detik", "sinkronisasi.jeda_maks_detik"],
  ["pelanggan.telepon_digit_min", "pelanggan.telepon_digit_maks"],
] as const;

/** Independent oracle for "matches the type and lies within the range or options". */
function expectedValid(def: SettingDefinition, v: unknown): boolean {
  switch (def.type) {
    case "int":
      return Number.isInteger(v) && (v as number) >= def.min && (v as number) <= def.max && (!("allowed" in def) || def.allowed.includes(v as never));
    case "bool":
      return v === true || v === false;
    case "text":
      return typeof v === "string" && v.length <= def.maxLength && (!("format" in def) || /^([01]\d|2[0-3]):[0-5]\d$/.test(v));
    case "enum":
      return typeof v === "string" && (def.options as readonly string[]).includes(v);
    case "multi":
      return Array.isArray(v) && v.length >= def.minSelected && new Set(v).size === v.length && v.every((x) => def.options.includes(x as never));
  }
}

/** Candidate values for one definition: valid ones, edge cases, and wrong types. */
function valueFor(def: SettingDefinition): fc.Arbitrary<unknown> {
  const noise = fc.oneof(fc.constant(null), fc.boolean(), fc.double(), fc.string({ maxLength: 8 }), fc.integer());
  switch (def.type) {
    case "int":
      return fc.oneof(fc.integer({ min: def.min - 3, max: def.max + 3 }), fc.constantFrom(def.min, def.max, def.min - 1, def.max + 1, def.min + 0.5), noise);
    case "bool":
      return fc.oneof(fc.boolean(), noise);
    case "text":
      return fc.oneof(fc.string({ maxLength: def.maxLength + 2 }), fc.constantFrom("00:00", "23:59", "24:00", "9:15"), noise);
    case "enum":
      return fc.oneof(fc.constantFrom(...def.options), noise);
    case "multi":
      return fc.oneof(fc.array(fc.constantFrom(...def.options, "zzz"), { maxLength: def.options.length + 1 }), noise);
  }
}

const defAndValue = fc.constantFrom(...SETTINGS).chain((def) => valueFor(def).map((value) => ({ def, value })));

function newService(): SettingsService {
  return new SettingsService({ uow: createMemorySettingsDb().uow, clock: fixedClock(), ids: sequentialIds() });
}

describe("Property 21: validasi dan reset pengaturan", () => {
  it("validateValue menerima nilai tepat bila sesuai tipe dan rentang/opsi", () => {
    fc.assert(fc.property(defAndValue, ({ def, value }) => {
      expect(validateValue(def, value) === null).toBe(expectedValid(def, value));
    }));
  });

  it("penyimpanan tidak valid tidak mengubah nilai; yang diterima menjaga min ≤ maks", async () => {
    await fc.assert(fc.asyncProperty(fc.array(defAndValue, { minLength: 1, maxLength: 12 }), async (steps) => {
      const service = newService();
      for (const { def, value } of steps) {
        const before = service.snapshot();
        const result = await service.setMany({ [def.key]: value }, owner);
        if (!expectedValid(def, value)) expect(result.ok).toBe(false);
        if (!result.ok) expect(service.snapshot()).toEqual(before);
        else expect(service.get(def.key)).toEqual(value);
        for (const [lo, hi] of PAIRS) expect(service.get(lo)).toBeLessThanOrEqual(service.get(hi));
        expect(validateCross(CROSS_RULES, service.snapshot())).toBeNull();
      }
    }));
  });

  it("reset mengembalikan setiap kunci terpilih tepat ke default dan kunci lain tidak berubah", async () => {
    const validDefAndValue = defAndValue.filter(({ def, value }) => expectedValid(def, value));
    const keys = fc.subarray(SETTINGS.map((s) => s.key), { minLength: 1 });
    await fc.assert(fc.asyncProperty(fc.array(validDefAndValue, { maxLength: 10 }), keys, async (edits, selected) => {
      const service = newService();
      for (const { def, value } of edits) await service.setMany({ [def.key]: value }, owner);
      const before = service.snapshot();
      const result = await service.reset(selected, owner);
      const defaults = defaultSettings();
      if (!result.ok) {
        // Only a cross-key rule can block a reset; then nothing changes.
        expect(result.code).toBe("invalid");
        expect(service.snapshot()).toEqual(before);
        return;
      }
      for (const s of SETTINGS) {
        expect(service.get(s.key)).toEqual(selected.includes(s.key) ? defaults[s.key] : before[s.key]);
      }
    }));
  });
});
