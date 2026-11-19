import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { divRoundHalfUp } from "@/domain/rounding";
import { computeTotals, NO_PROMO, type Discount, type LineInput, type PromoResult, type TaxConfig } from "@/domain/taxEngine";
const discountArb: fc.Arbitrary<Discount> = fc.oneof(
  fc.record({ kind: fc.constant("amount" as const), rp: fc.integer({ min: 0, max: 999_999_999 }) }),
  fc.record({ kind: fc.constant("percent" as const), bp: fc.integer({ min: 0, max: 10_000 }) }),
);
const linesArb: fc.Arbitrary<LineInput[]> = fc.uniqueArray(
    fc.record({
      key: fc.string({ minLength: 1, maxLength: 6 }),
      unitPriceRp: fc.integer({ min: 0, max: 2_000_000 }),
      adjustmentsRp: fc.integer({ min: 0, max: 50_000 }),
      qty: fc.integer({ min: 1, max: 50 }),
      discount: fc.option(discountArb, { nil: undefined }),
    }),
    { selector: (l) => l.key, maxLength: 8 },
  );
const cfgArb: fc.Arbitrary<TaxConfig> = fc.record({
  taxMode: fc.constantFrom("off" as const, "exclusive" as const, "inclusive" as const),
  taxRateBp: fc.integer({ min: 0, max: 10_000 }),
  taxBase: fc.constantFrom("after_discount" as const, "after_discount_plus_service" as const),
  serviceEnabled: fc.boolean(),
  serviceRateBp: fc.integer({ min: 0, max: 10_000 }),
  roundingStep: fc.constantFrom(0 as const, 100 as const, 500 as const, 1000 as const),
});
function promoArb(lines: LineInput[]): fc.Arbitrary<PromoResult> {
  const keys = lines.map((l) => l.key);
  const ok = fc
    .array(fc.tuple(fc.constantFrom(...keys, "missing"), fc.integer({ min: 0, max: 5_000_000 })), { maxLength: 4 })
    .map((pairs): PromoResult => ({ ok: true, discountsRp: Object.fromEntries(pairs), applied: [] }));
  return fc.oneof(ok, fc.constant<PromoResult>({ ok: false, reason: "condition_not_met" }));
}
const caseArb = linesArb.chain((lines) =>
  fc.record({
    lines: fc.constant(lines),
    order: fc.option(discountArb, { nil: undefined }),
    promo: promoArb(lines),
    cfg: cfgArb,
  }),
);
describe("Property 1: Tax_Engine total invariant", () => {
  // Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.9, 5.10, 5.12
  it("total = subtotal − diskon + pajak eksklusif + layanan + pembulatan, total ≥ 0", () => {
    fc.assert(
      fc.property(caseArb, ({ lines, order, promo, cfg }) => {
        const t = computeTotals(lines, order, promo, cfg);
        const values = [t.subtotalRp, t.discountRp, t.serviceChargeRp, t.taxExclusiveRp, t.taxInclusiveComponentRp, t.roundingRp, t.totalRp];
        values.forEach((v) => expect(Number.isInteger(v)).toBe(true));
        const expected = t.subtotalRp - t.discountRp + t.taxExclusiveRp + t.serviceChargeRp + t.roundingRp;
        expect(t.totalRp).toBe(expected);
        expect(t.totalRp).toBeGreaterThanOrEqual(0);
        expect(t.subtotalRp).toBe(lines.reduce((s, l) => s + (l.unitPriceRp + l.adjustmentsRp) * l.qty, 0));
        expect(t.discountRp).toBe(t.itemDiscountRp + t.promoDiscountRp + t.orderDiscountRp);
        expect(t.discountRp).toBeLessThanOrEqual(t.subtotalRp);
        t.lines.forEach((l) => {
          expect(l.netRp).toBeGreaterThanOrEqual(0);
          expect(l.netRp).toBeLessThanOrEqual(l.grossRp);
        });
        if (cfg.taxMode !== "exclusive") expect(t.taxExclusiveRp).toBe(0);
        if (cfg.taxMode === "off") expect(t.taxInclusiveComponentRp).toBe(0);
        if (!cfg.serviceEnabled) expect(t.serviceChargeRp).toBe(0);
        if (cfg.roundingStep === 0) expect(t.roundingRp).toBe(0);
        else {
          expect(Math.abs(t.roundingRp)).toBeLessThanOrEqual(cfg.roundingStep / 2);
          expect(t.totalRp % cfg.roundingStep).toBe(0);
        }
      }),
    );
  });
  it("diskon per item dibatasi nilai baris, setengah ke atas untuk persen", () => {
    fc.assert(
      fc.property(caseArb, ({ lines, cfg }) => {
        const t = computeTotals(lines, undefined, NO_PROMO, cfg);
        const byKey = new Map(lines.map((l) => [l.key, l]));
        let clamped = false;
        t.lines.forEach((out) => {
          const discount = byKey.get(out.key)?.discount;
          const raw = discount === undefined ? 0 : discount.kind === "amount" ? discount.rp : divRoundHalfUp(out.grossRp * discount.bp, 10_000);
          if (raw > out.grossRp) clamped = true;
          expect(out.netRp).toBe(out.grossRp - Math.min(raw, out.grossRp));
        });
        expect(t.clamped.item).toBe(clamped);
      }),
    );
  });
});
function shuffle<T>(items: T[], seeds: number[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = seeds[i % seeds.length] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
describe("Property 2: Tax_Engine confluence over item order", () => {
  // Validates: Requirements 5.7, 3.10
  it("hasil identik untuk setiap permutasi baris, Σ chargeTotalRp = totalRp", () => {
    const seedsArb = fc.array(fc.nat(), { minLength: 1, maxLength: 8 });
    fc.assert(
      fc.property(caseArb, seedsArb, ({ lines, order, promo, cfg }, seeds) => {
        const a = computeTotals(lines, order, promo, cfg);
        const b = computeTotals(shuffle(lines, seeds), order, promo, cfg);
        expect(b).toEqual(a);
        expect(a.lines.reduce((s, l) => s + l.chargeTotalRp, 0)).toBe(a.totalRp);
        a.lines.forEach((l) => expect(l.chargeTotalRp).toBeGreaterThanOrEqual(0));
      }),
    );
  });
});
