import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cumulativeShare, planRefund, type OrderSnapshot } from "@/domain/refund";

function order(): OrderSnapshot {
  return {
    status: "completed",
    lines: [
      {
        lineId: "L1",
        qty: 3,
        chargeTotalRp: 100,
        refundedQty: 0,
        consumption: [
          { ingredientId: "susu", qtyMilli: 1000 },
          { ingredientId: "kopi", qtyMilli: 50 },
        ],
      },
      { lineId: "L2", qty: 1, chargeTotalRp: 25_000, refundedQty: 0, consumption: [{ ingredientId: "kopi", qtyMilli: 18 }] },
    ],
  };
}

describe("cumulativeShare", () => {
  it("floor(total × q / qty) dengan q dibatasi", () => {
    expect(cumulativeShare(100, 3, 1)).toBe(33);
    expect(cumulativeShare(100, 3, 2)).toBe(66);
    expect(cumulativeShare(100, 3, 3)).toBe(100);
    expect(cumulativeShare(100, 3, 5)).toBe(100);
    expect(cumulativeShare(100, 3, 0)).toBe(0);
    expect(cumulativeShare(100, 0, 1)).toBe(0);
  });
  it("tetap eksak di luar rentang integer aman", () => {
    expect(cumulativeShare(9_007_199_254_740_991, 3, 2)).toBe(Number((9_007_199_254_740_991n * 2n) / 3n));
    expect(cumulativeShare(-9_007_199_254_740_991, 4, 3)).toBe(Number(-27_021_597_764_222_973n / 4n - 1n));
    expect(cumulativeShare(-9_007_199_254_740_992, 2, 2)).toBe(-9_007_199_254_740_992);
  });
});

describe("planRefund (contoh)", () => {
  it("refund parsial menghitung nominal, stok kembali, dan status", () => {
    const plan = planRefund(order(), { items: [{ lineId: "L1", qty: 1 }] });
    expect(plan).toEqual({
      ok: true,
      amountRp: 33,
      lines: [{ lineId: "L1", qty: 1, amountRp: 33 }],
      stockReturns: [
        { ingredientId: "kopi", qtyMilli: 16 },
        { ingredientId: "susu", qtyMilli: 333 },
      ],
      status: "partially_refunded",
    });
  });
  it("refund semua sisa menjadi refunded dan total sama dengan total order", () => {
    const o = order();
    const lines = o.lines.map((l, i) => (i === 0 ? { ...l, refundedQty: 1 } : l));
    const plan = planRefund({ status: "partially_refunded", lines }, {
      items: [
        { lineId: "L1", qty: 2 },
        { lineId: "L2", qty: 1 },
      ],
    });
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.amountRp + 33).toBe(25_100);
    expect(plan.status).toBe("refunded");
    expect(plan.stockReturns).toEqual([
      { ingredientId: "kopi", qtyMilli: 34 + 18 },
      { ingredientId: "susu", qtyMilli: 667 },
    ]);
  });
  it.each([
    [{ items: [] }, "minimal satu"],
    [{ items: [{ lineId: "X", qty: 1 }] }, "tidak dikenal"],
    [{ items: [{ lineId: "L1", qty: 1 }, { lineId: "L1", qty: 1 }] }, "lebih dari sekali"],
    [{ items: [{ lineId: "L1", qty: 0 }] }, "1 sampai 3"],
    [{ items: [{ lineId: "L1", qty: 1.5 }] }, "1 sampai 3"],
    [{ items: [{ lineId: "L2", qty: 2 }] }, "1 sampai 1"],
  ])("menolak permintaan tidak valid %#", (req, message) => {
    const plan = planRefund(order(), req);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toContain(message);
    expect(plan.maxPerLine).toEqual({ L1: 3, L2: 1 });
  });
  it.each(["voided", "refunded"])("menolak order berstatus %s", (status) => {
    const plan = planRefund({ ...order(), status }, { items: [{ lineId: "L1", qty: 1 }] });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toContain(status);
  });
});

const lineArb = fc.record({
  qty: fc.integer({ min: 1, max: 20 }),
  chargeTotalRp: fc.integer({ min: 0, max: 10_000_000 }),
  consumption: fc.uniqueArray(
    fc.record({ ingredientId: fc.constantFrom("a", "b", "c", "d"), qtyMilli: fc.integer({ min: 0, max: 1_000_000 }) }),
    { maxLength: 3, selector: (c) => c.ingredientId },
  ),
});
const orderArb = fc
  .array(lineArb, { minLength: 1, maxLength: 5 })
  .map((ls): OrderSnapshot => ({
    status: "completed",
    lines: ls.map((l, i) => ({ ...l, lineId: `L${i}`, refundedQty: 0 })),
  }));
const stepsArb = fc.array(fc.array(fc.record({ idx: fc.nat(4), frac: fc.double({ min: 0, max: 1, noNaN: true }) })), {
  maxLength: 8,
});

type Totals = { amount: number; stock: Map<string, number> };

/**
 * Applies random valid steps, checking per-step proration bounds; then refunds
 * all that remains. Returns cumulative totals after every step.
 */
function runSequence(start: OrderSnapshot, steps: Array<Array<{ idx: number; frac: number }>>): Totals[] {
  let current = start;
  const totals: Totals = { amount: 0, stock: new Map() };
  const history: Totals[] = [];
  const orderTotal = start.lines.reduce((s, l) => s + l.chargeTotalRp, 0);
  const finalStep = current.lines.map((_, idx) => ({ idx, frac: 1 }));
  for (const step of [...steps, finalStep]) {
    const items = new Map<string, number>();
    for (const { idx, frac } of step) {
      const line = current.lines[idx % current.lines.length];
      const rem = line.qty - line.refundedQty;
      if (rem > 0 && !items.has(line.lineId)) items.set(line.lineId, 1 + Math.floor(frac * (rem - 1)));
    }
    if (items.size === 0) continue;
    const plan = planRefund(current, { items: [...items].map(([lineId, qty]) => ({ lineId, qty })) });
    if (!plan.ok) throw new Error(plan.reason);
    for (const lp of plan.lines) {
      const line = current.lines.find((l) => l.lineId === lp.lineId);
      if (!line) throw new Error("baris hilang");
      const expected =
        cumulativeShare(line.chargeTotalRp, line.qty, line.refundedQty + lp.qty) -
        cumulativeShare(line.chargeTotalRp, line.qty, line.refundedQty);
      expect(lp.amountRp).toBe(expected);
    }
    totals.amount += plan.amountRp;
    for (const r of plan.stockReturns) totals.stock.set(r.ingredientId, (totals.stock.get(r.ingredientId) ?? 0) + r.qtyMilli);
    current = {
      status: plan.status,
      lines: current.lines.map((l) => ({ ...l, refundedQty: l.refundedQty + (items.get(l.lineId) ?? 0) })),
    };
    expect(totals.amount).toBeLessThanOrEqual(orderTotal);
    const pathIndependent = current.lines.reduce((s, l) => s + cumulativeShare(l.chargeTotalRp, l.qty, l.refundedQty), 0);
    expect(totals.amount).toBe(pathIndependent);
    expect(plan.status).toBe(current.lines.every((l) => l.refundedQty === l.qty) ? "refunded" : "partially_refunded");
    history.push({ amount: totals.amount, stock: new Map(totals.stock) });
  }
  expect(current.status).toBe("refunded");
  expect(totals.amount).toBe(orderTotal);
  return history;
}

// Feature: open-source-pos-upgrade, Property 5: Partial refund proration bounds
describe("Property 5: Partial refund proration bounds", () => {
  it("total ≤ total order, nominal kumulatif, tidak bergantung urutan, penuh = total order", () => {
    fc.assert(fc.property(orderArb, stepsArb, (o, steps) => void runSequence(o, steps)));
  });
  it("menolak jumlah < 1, non-integer, atau > sisa dengan batas per baris", () => {
    const badQty = fc.oneof(fc.integer({ min: -5, max: 0 }), fc.constant(0.5), fc.constant(21), fc.constant(Number.NaN));
    fc.assert(
      fc.property(orderArb, fc.nat(4), badQty, (o, idx, qty) => {
        const line = o.lines[idx % o.lines.length];
        const bad = qty === 21 ? line.qty + 1 : qty;
        const plan = planRefund(o, { items: [{ lineId: line.lineId, qty: bad }] });
        expect(plan.ok).toBe(false);
        if (plan.ok) return;
        expect(plan.maxPerLine).toEqual(Object.fromEntries(o.lines.map((l) => [l.lineId, l.qty])));
      }),
    );
  });
});

// Feature: open-source-pos-upgrade, Property 6: Refund stock return bounded by consumption
describe("Property 6: Refund stock return bounded by consumption", () => {
  it("stok kembali per bahan ≤ konsumsi setiap langkah dan sama saat semua unit direfund", () => {
    fc.assert(
      fc.property(orderArb, stepsArb, (o, steps) => {
        const consumed = new Map<string, number>();
        for (const l of o.lines) {
          for (const c of l.consumption) consumed.set(c.ingredientId, (consumed.get(c.ingredientId) ?? 0) + c.qtyMilli);
        }
        const history = runSequence(o, steps);
        for (const snapshot of history) {
          for (const [id, qty] of snapshot.stock) expect(qty).toBeLessThanOrEqual(consumed.get(id) ?? 0);
        }
        const last = history[history.length - 1];
        for (const [id, qty] of consumed) expect(last.stock.get(id) ?? 0).toBe(qty);
      }),
    );
  });
});
