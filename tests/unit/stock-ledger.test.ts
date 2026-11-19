import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MOVEMENT_TYPES,
  NEGATIVE_TYPES,
  POSITIVE_TYPES,
  balance,
  isMovementType,
  planStocktake,
  realToMilli,
  signedQty,
  type Movement,
  type MovementType,
} from "@/domain/stockLedger";

describe("signedQty dan balance (contoh)", () => {
  it("memberi tanda sesuai jenis movement", () => {
    expect(signedQty("purchase_received", 1500)).toBe(1500);
    expect(signedQty("return_in", 1)).toBe(1);
    expect(signedQty("sale_consumption", 250)).toBe(-250);
    expect(signedQty("waste", 0)).toBe(0);
  });
  it("menolak kuantitas tidak valid dan jenis tidak dikenal", () => {
    expect(() => signedQty("waste", -1)).toThrow();
    expect(() => signedQty("waste", 1.5)).toThrow();
    expect(() => signedQty("transfer" as MovementType, 1)).toThrow();
  });
  it("mengenali jenis movement", () => {
    expect(isMovementType("adjustment_out")).toBe(true);
    expect(isMovementType("transfer")).toBe(false);
  });
  it("menjumlahkan movement bertanda", () => {
    const movements: Movement[] = [
      { ingredientId: "a", type: "purchase_received", qtyMilli: 10_000 },
      { ingredientId: "a", type: "sale_consumption", qtyMilli: 3_000 },
      { ingredientId: "a", type: "waste", qtyMilli: 500 },
    ];
    expect(balance(movements)).toBe(6_500);
    expect(balance([])).toBe(0);
  });
});

describe("planStocktake (contoh)", () => {
  it("hanya membuat movement untuk selisih tidak nol", () => {
    const plan = planStocktake({ a: 1000, b: 500, c: 200 }, { b: 800, a: 1000, c: 0, d: 5 });
    expect(plan).toEqual([
      { ingredientId: "b", type: "adjustment_in", qtyMilli: 300 },
      { ingredientId: "c", type: "adjustment_out", qtyMilli: 200 },
      { ingredientId: "d", type: "adjustment_in", qtyMilli: 5 },
    ]);
  });
  it("menolak hitungan fisik negatif atau stok sistem non-integer", () => {
    expect(() => planStocktake({ a: 0 }, { a: -1 })).toThrow();
    expect(() => planStocktake({ a: 0.5 }, { a: 1 })).toThrow();
  });
});

describe("realToMilli (contoh)", () => {
  it("membulatkan setengah menjauhi nol secara desimal", () => {
    expect(realToMilli(1.0005)).toBe(1001);
    expect(realToMilli(-1.0005)).toBe(-1001);
    expect(realToMilli(1.0004)).toBe(1000);
    expect(realToMilli(2.5)).toBe(2500);
    expect(realToMilli(0)).toBe(0);
    expect(Object.is(realToMilli(-0.0001), 0)).toBe(true);
    expect(realToMilli(1e-7)).toBe(0);
    expect(realToMilli(123456789.1235)).toBe(123456789124);
  });
  it("menolak nilai tidak hingga atau terlalu besar", () => {
    expect(() => realToMilli(Number.NaN)).toThrow();
    expect(() => realToMilli(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => realToMilli(1e21)).toThrow();
  });
});

const movementArb = fc.record({
  ingredientId: fc.constantFrom("a", "b", "c"),
  type: fc.constantFrom(...MOVEMENT_TYPES),
  qtyMilli: fc.integer({ min: 1, max: 1_000_000_000 }),
});

// Feature: open-source-pos-upgrade, Property 8: Stock ledger invariant
describe("Property 8: Stock ledger invariant", () => {
  it("tanda sesuai jenis dan stok sama dengan jumlah movement bertanda", () => {
    fc.assert(
      fc.property(fc.array(movementArb, { maxLength: 50 }), (movements) => {
        for (const m of movements) {
          const s = signedQty(m.type, m.qtyMilli);
          const positive = (POSITIVE_TYPES as readonly string[]).includes(m.type);
          const negative = (NEGATIVE_TYPES as readonly string[]).includes(m.type);
          expect(positive !== negative).toBe(true);
          expect(s).toBe(positive ? m.qtyMilli : -m.qtyMilli);
        }
        const expected = movements.reduce((sum, m) => sum + signedQty(m.type, m.qtyMilli), 0);
        expect(balance(movements)).toBe(expected);
      }),
    );
  });
  it("stok opname membuat stok sistem sama dengan hitungan fisik", () => {
    const stock = fc.dictionary(fc.constantFrom("a", "b", "c", "d"), fc.integer({ min: -1e9, max: 1e9 }));
    const counts = fc.dictionary(fc.constantFrom("a", "b", "c", "e"), fc.integer({ min: 0, max: 1e9 }));
    fc.assert(
      fc.property(stock, counts, (system, physical) => {
        const plan = planStocktake(system, physical);
        for (const id of Object.keys(physical)) {
          const own = plan.filter((m) => m.ingredientId === id);
          const before = system[id] ?? 0;
          expect(own.length).toBe(before === physical[id] ? 0 : 1);
          expect(before + balance(own)).toBe(physical[id]);
          for (const m of own) {
            expect(m.qtyMilli).toBe(Math.abs(physical[id] - before));
          }
        }
        expect(plan.every((m) => m.ingredientId in physical && m.qtyMilli > 0)).toBe(true);
      }),
    );
  });
});

function expectedMilli(tenThousandths: number): number {
  const abs = Math.abs(tenThousandths);
  const rounded = Math.floor(abs / 10) + (abs % 10 >= 5 ? 1 : 0);
  return tenThousandths < 0 && rounded !== 0 ? -rounded : rounded;
}

// Feature: open-source-pos-upgrade, Property 9: REAL to milli conversion
describe("Property 9: REAL to milli conversion", () => {
  it("sama dengan x × 1000 dibulatkan desimal-eksak menjauhi nol dan simetris", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e13, max: 1e13 }), (n) => {
        const x = n / 10_000;
        const milli = realToMilli(x);
        expect(Number.isInteger(milli)).toBe(true);
        expect(milli).toBe(expectedMilli(n));
        expect(realToMilli(-x)).toBe(-milli || 0);
      }),
    );
  });
});
