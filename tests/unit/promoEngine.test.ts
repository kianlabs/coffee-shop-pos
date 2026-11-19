import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyPromos, promoRejectionMessage, type Promo } from "@/domain/promoEngine";
import { computeTotals, type LineInput, type PromoResult, type TaxConfig } from "@/domain/taxEngine";

const CFG: TaxConfig = {
  taxMode: "exclusive",
  taxRateBp: 1100,
  taxBase: "after_discount",
  serviceEnabled: false,
  serviceRateBp: 0,
  roundingStep: 0,
};
const line = (key: string, unitPriceRp: number, qty = 1): LineInput => ({ key, unitPriceRp, adjustmentsRp: 0, qty });
const total = (r: PromoResult): number => (r.ok ? Object.values(r.discountsRp).reduce((a, b) => a + b, 0) : 0);
const WED_NOON = new Date(2025, 0, 15, 12, 0); // Wednesday
const voucher = (over: Partial<Extract<Promo, { kind: "voucher" }>> = {}): Promo => ({
  kind: "voucher",
  id: "v1",
  code: "HEMAT",
  validFrom: "2025-01-01",
  validUntil: "2025-01-31",
  maxUses: 10,
  usedCount: 0,
  discount: { kind: "amount", rp: 5000 },
  ...over,
});
const happy = (over: Partial<Extract<Promo, { kind: "happy_hour" }>> = {}): Promo => ({
  kind: "happy_hour",
  id: "h1",
  days: [3],
  fromMin: 660,
  toMin: 780,
  scope: { kind: "all" },
  discount: { kind: "percent", bp: 1000 },
  ...over,
});
const bundle: Promo = {
  kind: "bundle",
  id: "b1",
  items: [
    { productId: "kopi", qty: 1 },
    { productId: "roti", qty: 1 },
  ],
  fixedPriceRp: 25_000,
};

describe("applyPromos: contoh", () => {
  it("tanpa promo: ok kosong", () => {
    expect(applyPromos([line("kopi|", 20_000)], [], undefined, WED_NOON)).toEqual({ ok: true, discountsRp: {}, applied: [] });
  });
  it("bundel: harga tetap untuk satu set, sisa unit dihargai normal", () => {
    const lines = [line("kopi|", 20_000, 2), line("roti|", 10_000)];
    const r = applyPromos(lines, [bundle], undefined, WED_NOON);
    expect(r).toMatchObject({ ok: true, applied: ["b1"] });
    expect(total(r)).toBe(5000);
  });
  it("bundel tidak berlaku bila item kurang atau tidak lebih murah", () => {
    expect(total(applyPromos([line("kopi|", 20_000)], [bundle], undefined, WED_NOON))).toBe(0);
    expect(total(applyPromos([line("kopi|", 5000), line("roti|", 5000)], [bundle], undefined, WED_NOON))).toBe(0);
  });
  it("bundel dengan qty 0 diabaikan", () => {
    const zero: Promo = { ...bundle, id: "b0", items: [{ productId: "kopi", qty: 0 }] };
    expect(total(applyPromos([line("kopi|", 20_000)], [zero], undefined, WED_NOON))).toBe(0);
  });
  it("happy hour: aktif di hari dan jam, tidak aktif di luar", () => {
    const lines = [line("kopi|", 20_000)];
    expect(total(applyPromos(lines, [happy()], undefined, WED_NOON))).toBe(2000);
    expect(total(applyPromos(lines, [happy()], undefined, new Date(2025, 0, 15, 13, 0)))).toBe(0);
    expect(total(applyPromos(lines, [happy()], undefined, new Date(2025, 0, 16, 12, 0)))).toBe(0);
  });
  it("happy hour melewati tengah malam memakai hari mulai", () => {
    const night = happy({ fromMin: 1320, toMin: 120, days: [3] });
    const lines = [line("kopi|", 10_000)];
    expect(total(applyPromos(lines, [night], undefined, new Date(2025, 0, 15, 23, 0)))).toBe(1000);
    expect(total(applyPromos(lines, [night], undefined, new Date(2025, 0, 16, 1, 0)))).toBe(1000);
    expect(total(applyPromos(lines, [night], undefined, new Date(2025, 0, 15, 1, 0)))).toBe(0);
  });
  it("happy hour hanya untuk produk dalam cakupan", () => {
    const scoped = happy({ scope: { kind: "products", productIds: ["roti"] } });
    const r = applyPromos([line("kopi|", 20_000), line("roti|", 10_000)], [scoped], undefined, WED_NOON);
    expect(r).toMatchObject({ ok: true, discountsRp: { "roti|": 1000 } });
  });
  it("voucher nominal dan persen, kode tak peka huruf", () => {
    const lines = [line("kopi|", 20_000)];
    expect(total(applyPromos(lines, [voucher()], " hemat ", WED_NOON))).toBe(5000);
    expect(total(applyPromos(lines, [voucher({ discount: { kind: "percent", bp: 5000 } })], "HEMAT", WED_NOON))).toBe(10_000);
  });
  it("voucher dibatasi sisa nilai keranjang", () => {
    const r = applyPromos([line("kopi|", 3000)], [voucher()], "HEMAT", WED_NOON);
    expect(total(r)).toBe(3000);
  });
  it("urutan bundel → happy hour → voucher: unit bundel tidak kena happy hour", () => {
    const lines = [line("kopi|", 20_000), line("roti|", 10_000)];
    const r = applyPromos(lines, [voucher(), happy(), bundle], "HEMAT", WED_NOON);
    expect(r).toMatchObject({ ok: true, applied: ["b1", "v1"] });
    expect(total(r)).toBe(10_000);
  });
  it("voucher ditolak dengan alasan", () => {
    const lines = [line("kopi|", 20_000)];
    const rej = (p: Promo[], code: string, now = WED_NOON): unknown => applyPromos(lines, p, code, now);
    expect(rej([voucher()], "LAIN")).toEqual({ ok: false, reason: "voucher_not_found" });
    expect(rej([voucher()], "HEMAT", new Date(2025, 1, 1))).toEqual({ ok: false, reason: "voucher_expired" });
    expect(rej([voucher()], "HEMAT", new Date(2024, 11, 31))).toEqual({ ok: false, reason: "voucher_expired" });
    expect(rej([voucher({ validUntil: "bukan tanggal" })], "HEMAT")).toEqual({ ok: false, reason: "voucher_expired" });
    expect(rej([voucher({ maxUses: 3, usedCount: 3 })], "HEMAT")).toEqual({ ok: false, reason: "voucher_exhausted" });
    expect(rej([voucher({ minSubtotalRp: 50_000 })], "HEMAT")).toEqual({ ok: false, reason: "condition_not_met" });
    expect(rej([voucher()], "HEMAT", WED_NOON)).toMatchObject({ ok: true });
  });
  it("voucher pada keranjang kosong ditolak; validUntil ISO datetime dipakai apa adanya", () => {
    expect(applyPromos([], [voucher()], "HEMAT", WED_NOON)).toEqual({ ok: false, reason: "condition_not_met" });
    const iso = voucher({ validFrom: "2025-01-15T00:00:00", validUntil: "2025-01-15T11:00:00" });
    expect(applyPromos([line("kopi|", 1000)], [iso], "HEMAT", WED_NOON)).toMatchObject({ ok: false, reason: "voucher_expired" });
  });
  it("kode kosong diabaikan; setiap alasan punya pesan", () => {
    expect(applyPromos([line("kopi|", 1000)], [voucher()], "  ", WED_NOON)).toMatchObject({ ok: true, applied: [] });
    for (const r of ["voucher_not_found", "voucher_expired", "voucher_exhausted", "condition_not_met"] as const) {
      expect(promoRejectionMessage(r).length).toBeGreaterThan(0);
    }
  });
  it("hasil dapat dipakai Tax_Engine dan tidak membuat total negatif", () => {
    const lines = [line("kopi|", 20_000), line("roti|", 10_000)];
    const r = applyPromos(lines, [bundle, happy()], undefined, WED_NOON);
    expect(computeTotals(lines, undefined, r, CFG).totalRp).toBeGreaterThanOrEqual(0);
  });
});

describe("Property 11: Promo order-independence and voucher rules", () => {
  const PRODUCTS = ["kopi", "roti", "teh"];
  const rowsArb = fc.uniqueArray(
    fc.record({
      p: fc.constantFrom(...PRODUCTS),
      v: fc.constantFrom("", "a", "b"),
      price: fc.integer({ min: 0, max: 100_000 }),
      qty: fc.integer({ min: 1, max: 6 }),
    }),
    { minLength: 0, maxLength: 8, selector: (r) => `${r.p}|${r.v}` },
  );
  const toLines = (rows: Array<{ p: string; v: string; price: number; qty: number }>): LineInput[] =>
    rows.map((r) => line(`${r.p}|${r.v}`, r.price, r.qty));
  const promos = [voucher(), happy(), bundle, happy({ id: "h2", discount: { kind: "amount", rp: 1500 } })];

  it("hasil sama untuk urutan item dan urutan promo berbeda", () => {
    fc.assert(
      fc.property(rowsArb, fc.boolean(), (rows, useCode) => {
        const code = useCode ? "HEMAT" : undefined;
        const a = applyPromos(toLines(rows), promos, code, WED_NOON);
        const b = applyPromos(toLines([...rows].reverse()), [...promos].reverse(), code, WED_NOON);
        expect(b).toEqual(a);
      }),
    );
  });
  it("diskon per baris tidak negatif, bulat, dan ≤ nilai baris", () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const lines = toLines(rows);
        const r = applyPromos(lines, promos, "HEMAT", WED_NOON);
        if (!r.ok) return;
        for (const l of lines) {
          const d = r.discountsRp[l.key] ?? 0;
          expect(Number.isInteger(d) && d >= 0 && d <= l.unitPriceRp * l.qty).toBe(true);
        }
        expect(Object.keys(r.discountsRp).every((k) => lines.some((l) => l.key === k))).toBe(true);
      }),
    );
  });
  it("voucher ditolak mempertahankan total (tidak ada diskon)", () => {
    const reasons = [
      { code: "NOPE", p: voucher(), reason: "voucher_not_found" },
      { code: "HEMAT", p: voucher({ validUntil: "2024-01-01" }), reason: "voucher_expired" },
      { code: "HEMAT", p: voucher({ maxUses: 2, usedCount: 2 }), reason: "voucher_exhausted" },
    ] as const;
    fc.assert(
      fc.property(rowsArb, fc.constantFrom(...reasons), (rows, c) => {
        const r = applyPromos(toLines(rows), [c.p], c.code, WED_NOON);
        expect(r).toEqual({ ok: false, reason: c.reason });
      }),
    );
  });
  it("batas pemakaian: ditolak tepat saat usedCount ≥ maxUses", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 0, max: 25 }), (maxUses, used) => {
        const r = applyPromos([line("kopi|", 50_000)], [voucher({ maxUses, usedCount: used })], "HEMAT", WED_NOON);
        expect(r.ok).toBe(used < maxUses);
      }),
    );
  });
});
