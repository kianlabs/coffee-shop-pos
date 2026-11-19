import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calcLineTotal, calcSubtotal, calcTotal } from "@/domain/money";

const rupiah = fc.integer({ min: 0, max: 10_000_000 });
const qty = fc.integer({ min: 1, max: 500 });

describe("calcLineTotal", () => {
  it("sama dengan harga satuan dikali jumlah untuk input positif", () => {
    fc.assert(
      fc.property(rupiah, qty, (unit, q) => {
        expect(calcLineTotal(unit, q)).toBe(unit * q);
      }),
    );
  });

  it("tidak pernah negatif", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 10_000 }), fc.integer({ min: -10, max: 100 }), (unit, q) => {
        expect(calcLineTotal(unit, q)).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

describe("calcSubtotal", () => {
  it("sama dengan jumlah setiap baris", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ unitPriceRp: rupiah, qty }), { maxLength: 20 }), (lines) => {
        const expected = lines.reduce((sum, l) => sum + l.unitPriceRp * l.qty, 0);
        expect(calcSubtotal(lines)).toBe(expected);
      }),
    );
  });
});

describe("calcTotal", () => {
  it("tidak pernah negatif walau diskon lebih besar dari subtotal", () => {
    fc.assert(
      fc.property(rupiah, rupiah, rupiah, (sub, disc, tax) => {
        expect(calcTotal(sub, disc, tax)).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});
