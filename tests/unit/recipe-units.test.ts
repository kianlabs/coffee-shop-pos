import { describe, expect, it } from "vitest";
import { nextRecipeVersion, roundRecipeQty, validateRecipeDraft, validateRecipeLines } from "@/domain/recipe";
import { COMMON_BASE_UNITS, convertQty, formatQtyWithUnit, getCompatibleUnits, isConvertible, normalizeUnit, roundQty, unitFamily } from "@/domain/units";
import { isNewerVersion } from "@/domain/semver";

describe("recipe", () => {
  it("pembulatan takaran ke 3 desimal dan versi berikutnya", () => {
    expect(roundRecipeQty(1.23456)).toBe(1.235);
    expect(roundRecipeQty(Number.NaN)).toBe(0);
    expect(nextRecipeVersion(null)).toBe(1);
    expect(nextRecipeVersion(0)).toBe(1);
    expect(nextRecipeVersion(3)).toBe(4);
    expect(nextRecipeVersion(2.9)).toBe(3);
  });

  it("validasi baris: minimal satu, takaran positif, tanpa duplikat", () => {
    expect(validateRecipeLines([])).toMatch(/minimal satu/);
    expect(validateRecipeLines([{ ingredientId: "a", qtyPerUnit: 0 }])).not.toBeNull();
    expect(validateRecipeLines([{ ingredientId: "", qtyPerUnit: 1 }])).not.toBeNull();
    expect(validateRecipeLines([{ ingredientId: "a", qtyPerUnit: 1 }, { ingredientId: "a", qtyPerUnit: 2 }])).toMatch(/duplikat|sama|dua kali/i);
    expect(validateRecipeLines([{ ingredientId: "a", qtyPerUnit: 1 }])).toBeNull();
  });

  it("validasi draft resep menurut baris", () => {
    expect(validateRecipeDraft({ productId: "p", variantId: null, lines: [] })).not.toBeNull();
    expect(validateRecipeDraft({ productId: "p", variantId: null, lines: [{ ingredientId: "a", qtyPerUnit: 2 }] })).toBeNull();
  });
});

describe("units", () => {
  it("konversi kg ke g dan l ke ml", () => {
    expect(convertQty(1.5, "kg", "g")).toBe(1500);
    expect(convertQty(250, "ml", "l")).toBeCloseTo(0.25, 6);
    expect(convertQty(1, "kg", "ml")).toBeNull();
    expect(isConvertible("kg", "g")).toBe(true);
    expect(isConvertible("kg", "ml")).toBe(false);
  });

  it("keluarga satuan, normalisasi, dan satuan yang kompatibel", () => {
    expect(unitFamily("kg")).not.toBe(unitFamily("ml"));
    expect(normalizeUnit("  KG ")).toBe("kg");
    expect(getCompatibleUnits("g")).toEqual(expect.arrayContaining(["g", "kg"]));
    expect(COMMON_BASE_UNITS).toContain("pcs");
    expect(unitFamily("satuan-asing")).toBeDefined();
  });

  it("pembulatan dan format kuantitas", () => {
    expect(roundQty(1.23456)).toBe(1.235);
    expect(formatQtyWithUnit(1500, "g")).toMatch(/1/);
  });
});

describe("semver", () => {
  it("membandingkan tag dengan versi saat ini", () => {
    expect(isNewerVersion("v1.0.2", "1.0.1")).toBe(true);
    expect(isNewerVersion("1.0.1", "1.0.1")).toBe(false);
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(false);
    expect(isNewerVersion("v2.0.0", "1.9.9")).toBe(true);
  });
});

describe("formatQtyWithUnit cabang konversi", () => {
  it("menampilkan setara satuan lebih besar atau lebih kecil", () => {
    expect(formatQtyWithUnit(2500, "g")).toBe("2500 g (2.5 kg)");
    expect(formatQtyWithUnit(0.5, "kg")).toBe("0.5 kg (500 g)");
    expect(formatQtyWithUnit(1500, "ml")).toBe("1500 ml (1.5 l)");
    expect(formatQtyWithUnit(0.25, "l")).toBe("0.25 l (250 ml)");
    expect(formatQtyWithUnit(2000, "mg")).toBe("2000 mg (2 g)");
    expect(formatQtyWithUnit(3, "pcs")).toBe("3 pcs");
    expect(formatQtyWithUnit(0, "kg")).toBe("0 kg");
  });

  it("daftar satuan kompatibel untuk massa, volume, dan satuan lain", () => {
    expect(getCompatibleUnits("kg")[0]).toBe("kg");
    expect(getCompatibleUnits("ml")).toEqual(["ml", "l"]);
    expect(getCompatibleUnits("l")).toEqual(["l", "ml"]);
    expect(getCompatibleUnits("")).toEqual([]);
    expect(getCompatibleUnits("pcs")).toEqual(["pcs"]);
  });
});
