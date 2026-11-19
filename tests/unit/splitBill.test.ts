import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allocateLargestRemainder, splitByItems, splitEqually } from "@/domain/splitBill";
import { computeTotals, NO_PROMO, type LineInput, type TaxConfig } from "@/domain/taxEngine";

const CFG: TaxConfig = {
  taxMode: "exclusive",
  taxRateBp: 1100,
  taxBase: "after_discount",
  serviceEnabled: true,
  serviceRateBp: 500,
  roundingStep: 100,
};
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe("splitBill: contoh", () => {
  it("bagi rata: sisa ke indeks terkecil", () => {
    expect(splitEqually(100, 3)).toEqual([34, 33, 33]);
    expect(splitEqually(0, 2)).toEqual([0, 0]);
  });
  it("seri sisa dipecah menurut indeks terkecil", () => {
    expect(allocateLargestRemainder(2, [1, 1, 1])).toEqual([1, 1, 0]);
  });
  it("bobot nol semua jatuh ke bobot sama", () => {
    expect(allocateLargestRemainder(5, [0, 0])).toEqual([3, 2]);
    expect(allocateLargestRemainder(0, [])).toEqual([]);
  });
  it("menolak masukan tidak valid", () => {
    expect(() => allocateLargestRemainder(-1, [1])).toThrow(RangeError);
    expect(() => allocateLargestRemainder(1.5, [1])).toThrow(RangeError);
    expect(() => allocateLargestRemainder(1, [-1, 2])).toThrow(RangeError);
    expect(() => allocateLargestRemainder(1, [])).toThrow(RangeError);
    expect(() => splitEqually(10, 0)).toThrow(RangeError);
  });
  it("per item mengikuti penugasan baris", () => {
    const lines: LineInput[] = [
      { key: "a", unitPriceRp: 10_000, adjustmentsRp: 0, qty: 1 },
      { key: "b", unitPriceRp: 20_000, adjustmentsRp: 0, qty: 1 },
    ];
    const t = computeTotals(lines, undefined, NO_PROMO, { ...CFG, taxMode: "off", serviceEnabled: false, roundingStep: 0 });
    expect(splitByItems(t, { a: 0, b: 1 }, 2)).toEqual([10_000, 20_000]);
    expect(splitByItems(t, { a: 1, b: 1 }, 2)).toEqual([0, 30_000]);
  });
  it("per item menolak penugasan hilang atau di luar rentang", () => {
    const t = computeTotals([{ key: "a", unitPriceRp: 1000, adjustmentsRp: 0, qty: 1 }], undefined, NO_PROMO, CFG);
    expect(() => splitByItems(t, {}, 2)).toThrow(RangeError);
    expect(() => splitByItems(t, { a: 2 }, 2)).toThrow(RangeError);
    expect(() => splitByItems(t, { a: 0.5 }, 2)).toThrow(RangeError);
  });
});

describe("Property 10: Split_Bill allocation sum", () => {
  it("alokasi: jumlah bagian = total, tidak ada bagian negatif", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.array(fc.integer({ min: 0, max: 100_000_000 }), { minLength: 1, maxLength: 12 }),
        (total, weights) => {
          const shares = allocateLargestRemainder(total, weights);
          expect(sum(shares)).toBe(total);
          expect(shares.every((s) => Number.isInteger(s) && s >= 0)).toBe(true);
        },
      ),
    );
  });
  it("bagi rata: jumlah = total dan selisih antar bagian ≤ 1", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), fc.integer({ min: 1, max: 20 }), (total, n) => {
        const shares = splitEqually(total, n);
        expect(sum(shares)).toBe(total);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      }),
    );
  });
  it("per item: jumlah = total order dan tak ada bagian negatif", () => {
    const lineArb = fc.record({
      unitPriceRp: fc.integer({ min: 0, max: 500_000 }),
      qty: fc.integer({ min: 1, max: 9 }),
      bill: fc.integer({ min: 0, max: 4 }),
    });
    fc.assert(
      fc.property(fc.array(lineArb, { minLength: 1, maxLength: 10 }), fc.integer({ min: 5, max: 6 }), (rows, bills) => {
        const lines = rows.map((r, i) => ({ key: `k${i}`, unitPriceRp: r.unitPriceRp, adjustmentsRp: 0, qty: r.qty }));
        const assignment = Object.fromEntries(rows.map((r, i) => [`k${i}`, r.bill]));
        const t = computeTotals(lines, undefined, NO_PROMO, CFG);
        const shares = splitByItems(t, assignment, bills);
        expect(sum(shares)).toBe(t.totalRp);
        expect(shares.every((s) => s >= 0)).toBe(true);
      }),
    );
  });
});
