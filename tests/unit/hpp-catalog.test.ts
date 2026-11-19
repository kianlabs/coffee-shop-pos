import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { unitPriceFor, variantsOf, type CatalogProduct } from "@/domain/catalog";
import { calcHppForLine, calcHppTotal, resolveLastCost, snapshotForOrder } from "@/domain/hpp";
import { clampRupiah, formatPct, isHppMode, isVariantHppMode, marginFor, resolveHpp } from "@/domain/hppResolve";

const product: CatalogProduct = {
  id: "p1",
  categoryId: "c1",
  name: "Latte",
  basePriceRp: 25000,
  isActive: true,
  variants: [
    { id: "v1", productId: "p1", name: "Large", priceDeltaRp: 5000, isActive: true },
    { id: "v2", productId: "p1", name: "Lama", priceDeltaRp: 0, isActive: false },
  ],
};

describe("catalog", () => {
  it("harga varian = harga dasar + selisih, dan varian nonaktif disembunyikan", () => {
    expect(unitPriceFor(product, product.variants[0])).toBe(30000);
    expect(unitPriceFor(product, null)).toBe(25000);
    expect(variantsOf(product).map((v) => v.name)).toEqual(["Large"]);
  });
});

describe("HPP", () => {
  it("biaya baris = takaran x harga, dibulatkan ke rupiah", () => {
    const hpp = calcHppForLine([
      { ingredientId: "i1", ingredientName: "Susu", qtyPerUnit: 200, costPerUnitRp: 20 },
      { ingredientId: "i2", ingredientName: "Espresso", qtyPerUnit: 18.5, costPerUnitRp: 1000 },
    ]);
    expect(hpp.lines[0].lineCostRp).toBe(4000);
    expect(hpp.lines[1].lineCostRp).toBe(18500);
    expect(hpp.perUnitRp).toBe(22500);
  });

  it("menolak takaran nol dan harga negatif", () => {
    expect(() => calcHppForLine([{ ingredientId: "i", ingredientName: "X", qtyPerUnit: 0, costPerUnitRp: 1 }])).toThrow(/lebih dari 0/);
    expect(() => calcHppForLine([{ ingredientId: "i", ingredientName: "X", qtyPerUnit: 1, costPerUnitRp: -1 }])).toThrow(/negatif/);
    expect(() => calcHppForLine([{ ingredientId: "", ingredientName: "X", qtyPerUnit: 1, costPerUnitRp: 1 }])).toThrow(/wajib/);
  });

  it("total HPP per baris sama dengan satuan x jumlah", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 0, max: 100 }), (unit, qty) => {
        expect(calcHppTotal(unit, qty)).toBe(unit * qty);
      }),
    );
  });

  it("biaya terakhir per bahan diambil dari entri effective_at terbaru", () => {
    const map = resolveLastCost([
      { ingredientId: "a", costPerUnitRp: 100, effectiveAt: "2026-01-01" },
      { ingredientId: "a", costPerUnitRp: 150, effectiveAt: "2026-03-01" },
      { ingredientId: "a", costPerUnitRp: 120, effectiveAt: "2026-02-01" },
      { ingredientId: "b", costPerUnitRp: 90, effectiveAt: "2026-02-01" },
    ]);
    expect(map.get("a")).toBe(150);
    expect(map.get("b")).toBe(90);
  });

  it("snapshot per order mengalikan jumlah pesanan", () => {
    const hpp = calcHppForLine([{ ingredientId: "i", ingredientName: "Susu", qtyPerUnit: 200, costPerUnitRp: 20 }]);
    const snap = snapshotForOrder("item-1", 3, hpp);
    expect(snap.hppTotalRp).toBe(12000);
    expect(snap.rows[0].qty).toBe(600);
    expect(() => snapshotForOrder("", 1, hpp)).toThrow(/wajib/);
    expect(() => snapshotForOrder("x", 0, hpp)).toThrow(/lebih dari 0/);
  });
});

describe("hppResolve", () => {
  it("mode manual memakai angka manual dan memberi catatan bila nol", () => {
    expect(resolveHpp("manual", 9000, null)).toEqual({ unitHppRp: 9000, source: "manual", note: null });
    expect(resolveHpp("manual", 0, null).note).toMatch(/masih 0/);
  });

  it("mode resep memakai resep, lalu cadangan manual, lalu none", () => {
    expect(resolveHpp("recipe", 1, 8000).source).toBe("recipe");
    expect(resolveHpp("recipe", 9000, null)).toMatchObject({ source: "manual", unitHppRp: 9000 });
    expect(resolveHpp("recipe", 0, null)).toMatchObject({ source: "none", unitHppRp: 0 });
    expect(resolveHpp("recipe", 0, 0).source).toBe("none");
  });

  it("mode none selalu nol", () => {
    expect(resolveHpp("none", 5000, 5000)).toEqual({ unitHppRp: 0, source: "none", note: null });
  });

  it("validasi tipe mode dan clamp angka", () => {
    expect(isHppMode("manual")).toBe(true);
    expect(isHppMode("inherit")).toBe(false);
    expect(isVariantHppMode("inherit")).toBe(true);
    expect(clampRupiah(-5)).toBe(0);
    expect(clampRupiah("abc")).toBe(0);
    expect(clampRupiah(12.7)).toBe(12);
  });

  it("margin dan markup dengan pembulatan satu desimal", () => {
    expect(marginFor(25000, 10000)).toEqual({ profitRp: 15000, marginPct: 60, markupPct: 150 });
    expect(marginFor(0, 0)).toEqual({ profitRp: 0, marginPct: null, markupPct: null });
    expect(formatPct(null)).toBe("—");
    expect(formatPct(60)).toBe("60.0%");
  });
});
