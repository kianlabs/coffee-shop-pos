import { describe, expect, it } from "vitest";
import { computeTotals, NO_PROMO, type LineInput, type TaxConfig } from "@/domain/taxEngine";
import { allocateLargestRemainder, discountError } from "@/domain/taxEngineInput";
const OFF: TaxConfig = {
  taxMode: "off",
  taxRateBp: 0,
  taxBase: "after_discount",
  serviceEnabled: false,
  serviceRateBp: 0,
  roundingStep: 0,
};
const line = (key: string, unitPriceRp: number, qty = 1, extra: Partial<LineInput> = {}): LineInput => ({
  key,
  unitPriceRp,
  adjustmentsRp: 0,
  qty,
  ...extra,
});
describe("computeTotals: contoh", () => {
  it("keranjang kosong menghasilkan total nol", () => {
    const t = computeTotals([], undefined, NO_PROMO, { ...OFF, taxMode: "exclusive", taxRateBp: 1000, roundingStep: 1000 });
    expect(t.totalRp).toBe(0);
    expect(t.subtotalRp).toBe(0);
    expect(t.lines).toEqual([]);
  });
  it("diskon 100% menghasilkan total nol walau pajak dan layanan aktif", () => {
    const cfg: TaxConfig = { ...OFF, taxMode: "exclusive", taxRateBp: 1100, serviceEnabled: true, serviceRateBp: 500, roundingStep: 500 };
    const t = computeTotals([line("a", 20_000)], { kind: "percent", bp: 10_000 }, NO_PROMO, cfg);
    expect(t).toMatchObject({ orderDiscountRp: 20_000, serviceChargeRp: 0, taxExclusiveRp: 0, roundingRp: 0, totalRp: 0 });
    expect(t.lines[0].chargeTotalRp).toBe(0);
  });
  it("urutan operasi lengkap sesuai dokumen", () => {
    const cfg: TaxConfig = {
      taxMode: "exclusive",
      taxRateBp: 1100,
      taxBase: "after_discount_plus_service",
      serviceEnabled: true,
      serviceRateBp: 500,
      roundingStep: 100,
    };
    const lines = [
      line("b", 25_000, 1, { adjustmentsRp: 5_000, discount: { kind: "amount", rp: 40_000 } }),
      line("a", 18_000, 2, { discount: { kind: "percent", bp: 1000 } }),
    ];
    const t = computeTotals(lines, { kind: "amount", rp: 5_000 }, NO_PROMO, cfg);
    expect(t).toMatchObject({
      subtotalRp: 66_000,
      itemDiscountRp: 33_600,
      orderDiscountRp: 5_000,
      discountRp: 38_600,
      serviceChargeRp: 1_370,
      taxExclusiveRp: 3_165,
      roundingRp: -35,
      totalRp: 31_900,
      clamped: { item: true, order: false },
    });
    expect(t.lines).toEqual([
      { key: "a", grossRp: 36_000, netRp: 27_400, chargeTotalRp: 31_900 },
      { key: "b", grossRp: 30_000, netRp: 0, chargeTotalRp: 0 },
    ]);
  });
  it("diskon order melebihi subtotal dibatasi tepat subtotal", () => {
    const t = computeTotals([line("a", 10_000), line("b", 5_000)], { kind: "amount", rp: 999_999_999 }, NO_PROMO, OFF);
    expect(t.orderDiscountRp).toBe(15_000);
    expect(t.totalRp).toBe(0);
    expect(t.clamped).toEqual({ item: false, order: true });
  });
  it("pajak eksklusif 0 dan 10.000 basis poin", () => {
    const zero = computeTotals([line("a", 10_001)], undefined, NO_PROMO, { ...OFF, taxMode: "exclusive" });
    expect(zero.taxExclusiveRp).toBe(0);
    expect(zero.totalRp).toBe(10_001);
    const full = computeTotals([line("a", 10_001)], undefined, NO_PROMO, { ...OFF, taxMode: "exclusive", taxRateBp: 10_000 });
    expect(full.taxExclusiveRp).toBe(10_001);
    expect(full.totalRp).toBe(20_002);
  });
  it("pajak inklusif 0 dan 10.000 basis poin hanya informasi", () => {
    const zero = computeTotals([line("a", 10_000)], undefined, NO_PROMO, { ...OFF, taxMode: "inclusive" });
    expect(zero.taxInclusiveComponentRp).toBe(0);
    const full = computeTotals([line("a", 10_000)], undefined, NO_PROMO, { ...OFF, taxMode: "inclusive", taxRateBp: 10_000 });
    expect(full).toMatchObject({ taxInclusiveComponentRp: 5_000, taxExclusiveRp: 0, totalRp: 10_000 });
  });
  it("pajak inklusif 11% dibulatkan setengah ke atas", () => {
    // 11.100 × 10.000 / 11.100 = 10.000 → component 1.100.
    const t = computeTotals([line("a", 11_100)], undefined, NO_PROMO, { ...OFF, taxMode: "inclusive", taxRateBp: 1100 });
    expect(t.taxInclusiveComponentRp).toBe(1_100);
  });
  it("dasar pajak tanpa layanan", () => {
    const cfg: TaxConfig = { ...OFF, taxMode: "exclusive", taxRateBp: 1000, serviceEnabled: true, serviceRateBp: 1000 };
    const t = computeTotals([line("a", 10_000)], undefined, NO_PROMO, cfg);
    expect(t).toMatchObject({ serviceChargeRp: 1_000, taxExclusiveRp: 1_000, totalRp: 12_000 });
  });
  it("diskon promo dibatasi nilai baris setelah diskon item; promo gagal diabaikan", () => {
    const promo = { ok: true as const, discountsRp: { a: 50_000, z: 7 }, applied: ["v1"] };
    const lines = [line("a", 10_000, 1, { discount: { kind: "amount", rp: 2_000 } }), line("b", 5_000)];
    const t = computeTotals(lines, undefined, promo, OFF);
    expect(t).toMatchObject({ itemDiscountRp: 2_000, promoDiscountRp: 8_000, totalRp: 5_000 });
    const failed = computeTotals(lines, undefined, { ok: false, reason: "voucher_expired" }, OFF);
    expect(failed.promoDiscountRp).toBe(0);
  });
  it("menolak masukan tidak valid dengan RangeError", () => {
    const bad: Array<() => unknown> = [
      () => computeTotals([line("a", 1.5)], undefined, NO_PROMO, OFF),
      () => computeTotals([line("a", 100, 0)], undefined, NO_PROMO, OFF),
      () => computeTotals([line("a", 100, 1, { adjustmentsRp: -101 })], undefined, NO_PROMO, OFF),
      () => computeTotals([line("a", 100), line("a", 200)], undefined, NO_PROMO, OFF),
      () => computeTotals([line("a", 100)], { kind: "percent", bp: 10_001 }, NO_PROMO, OFF),
      () => computeTotals([line("a", 100)], { kind: "amount", rp: -1 }, NO_PROMO, OFF),
      () => computeTotals([line("a", 100, 1, { discount: { kind: "amount", rp: 1e9 } })], undefined, NO_PROMO, OFF),
      () => computeTotals([line("a", 100)], undefined, NO_PROMO, { ...OFF, taxRateBp: 10_001 }),
      () => computeTotals([line("a", 100)], undefined, NO_PROMO, { ...OFF, serviceRateBp: -1 }),
      () => computeTotals([line("a", 100)], undefined, NO_PROMO, { ...OFF, taxMode: "vat" as TaxConfig["taxMode"] }),
      () => computeTotals([line("a", 100)], undefined, NO_PROMO, { ...OFF, taxBase: "x" as TaxConfig["taxBase"] }),
      () => computeTotals([line("a", 100)], undefined, NO_PROMO, { ...OFF, roundingStep: 50 as TaxConfig["roundingStep"] }),
      () => computeTotals([line("a", 100)], undefined, { ok: true, discountsRp: { a: -1 }, applied: [] }, OFF),
      () => computeTotals([line("a", 2 ** 52, 4)], undefined, NO_PROMO, OFF),
      () => computeTotals([line("a", 2 ** 52), line("b", 2 ** 52)], undefined, NO_PROMO, OFF),
    ];
    for (const run of bad) expect(run).toThrow(RangeError);
  });
});
describe("discountError", () => {
  it("menyebut rentang yang diizinkan", () => {
    expect(discountError({ kind: "percent", bp: 5000 })).toBeNull();
    expect(discountError({ kind: "percent", bp: 10_001 })).toContain("0–100%");
    expect(discountError({ kind: "amount", rp: 999_999_999 })).toBeNull();
    expect(discountError({ kind: "amount", rp: 1_000_000_000 })).toContain("999.999.999");
  });
});
describe("allocateLargestRemainder", () => {
  it("sisa terbesar, seri ke indeks terkecil", () => {
    expect(allocateLargestRemainder(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocateLargestRemainder(100, [1, 2])).toEqual([33, 67]);
    expect(allocateLargestRemainder(0, [1, 2])).toEqual([0, 0]);
    expect(allocateLargestRemainder(5, [0, 0])).toEqual([0, 0]);
  });
  it("tidak meluap untuk nominal besar", () => {
    const parts = allocateLargestRemainder(999_999_999_999, [999_999_999_999, 1]);
    expect(parts[0] + parts[1]).toBe(999_999_999_999);
  });
});
