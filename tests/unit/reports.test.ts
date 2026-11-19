import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Order, OrderLine } from "@/domain/orders";
import { buildReport, hourlyBreakdown, salesReport, validateReportRange } from "@/domain/reports";

const START = new Date(2025, 0, 1, 0, 0, 0, 0);
const END = new Date(2025, 0, 31, 23, 59, 59, 999);

function line(p: number, qty: number, unit: number, hpp: number, disc: number): OrderLine {
  const total = unit * qty;
  return {
    productId: `p${p}`,
    variantId: null,
    productName: `Produk ${p}`,
    variantName: null,
    unitPriceRp: unit,
    qty,
    lineTotalRp: total,
    discountRp: disc,
    netTotalRp: total - disc,
    hppTotal: hpp,
  };
}

function order(id: string, status: Order["status"], day: number, hour: number, lines: OrderLine[], method = "cash"): Order {
  const subtotal = lines.reduce((s, l) => s + l.lineTotalRp, 0);
  const discount = lines.reduce((s, l) => s + l.discountRp, 0);
  const tax = Math.round((subtotal - discount) * 0.1);
  return {
    id,
    receiptNumber: id,
    idempotencyKey: id,
    status,
    lines,
    subtotalRp: subtotal,
    discountRp: discount,
    taxRp: tax,
    serviceChargeRp: 0,
    roundingRp: 0,
    totalRp: subtotal - discount + tax,
    payment: { method: method as Order["payment"]["method"], amountRp: 1_000_000, paidAt: "" },
    changeRp: 0,
    notes: null,
    createdAt: new Date(2025, 0, day, hour, 30).toISOString(),
  };
}

describe("reports (examples)", () => {
  const orders = [
    order("a", "completed", 2, 9, [line(1, 2, 20_000, 10_000, 0)]),
    order("b", "completed", 2, 9, [line(1, 1, 20_000, 5_000, 2_000), line(2, 1, 15_000, 6_000, 0)], "qris_manual"),
    order("c", "voided", 3, 10, [line(1, 5, 20_000, 25_000, 0)]),
    order("d", "refunded", 3, 11, [line(2, 1, 15_000, 6_000, 0)]),
  ];
  it("excludes voids from gross and net, subtracts refunds", () => {
    const r = salesReport(orders, START, END);
    expect(r.voidedCount).toBe(1);
    expect(r.refundedRp).toBe(orders[3].totalRp);
    expect(r.grossRp).toBe(orders[0].totalRp + orders[1].totalRp + orders[3].totalRp);
    expect(r.netRp).toBe(orders[0].totalRp + orders[1].totalRp);
    expect(r.hppRp).toBe(21_000);
    expect(r.isEmpty).toBe(false);
  });
  it("builds payment mix, per-product and hourly parts", () => {
    const r = buildReport(orders, START, END);
    expect(r.payments.map((p) => p.method).sort()).toEqual(["cash", "qris_manual"]);
    expect(r.products.find((p) => p.productId === "p1")?.qty).toBe(3);
    expect(r.hours).toHaveLength(24);
    expect(r.hours[9]).toMatchObject({ orderCount: 2, totalRp: r.summary.netRp });
  });
  it("reports empty ranges with zeros", () => {
    const r = buildReport([], START, END);
    expect(r.summary).toMatchObject({ grossRp: 0, netRp: 0, hppRp: 0, isEmpty: true });
    expect(r.products).toEqual([]);
    expect(hourlyBreakdown([], START, END).every((s) => s.totalRp === 0)).toBe(true);
  });
  it("ignores orders outside the range", () => {
    expect(salesReport(orders, new Date(2025, 1, 1), new Date(2025, 1, 2)).isEmpty).toBe(true);
  });
  it("validates range", () => {
    expect(validateReportRange(START, END, 366)).toBeNull();
    expect(validateReportRange(END, START, 366)).toContain("awal");
    expect(validateReportRange(START, END, 10)).toContain("10");
    expect(validateReportRange(new Date(NaN), END, 10)).not.toBeNull();
    const oneDay = new Date(2025, 0, 1, 23, 59, 59, 999);
    expect(validateReportRange(START, oneDay, 1)).toBeNull();
  });
});

describe("report reconciliation (property 13, task 17.3)", () => {
  const lineArb = fc
    .record({
      p: fc.integer({ min: 1, max: 4 }),
      qty: fc.integer({ min: 1, max: 5 }),
      unit: fc.integer({ min: 1, max: 100 }).map((n) => n * 500),
      hpp: fc.integer({ min: 0, max: 30_000 }),
      disc: fc.integer({ min: 0, max: 500 }),
    })
    .map((x) => line(x.p, x.qty, x.unit, x.hpp, x.disc));
  const orderArb = fc
    .record({
      status: fc.constantFrom<Order["status"]>("completed", "completed", "voided", "refunded"),
      day: fc.integer({ min: 1, max: 31 }),
      hour: fc.integer({ min: 0, max: 23 }),
      lines: fc.array(lineArb, { minLength: 1, maxLength: 4 }),
      method: fc.constantFrom("cash", "qris_manual", "other"),
    })
    .map((x, i) => order(`o${i}`, x.status, x.day, x.hour, x.lines, x.method));

  it("parts sum to the totals", () => {
    fc.assert(
      fc.property(fc.array(orderArb, { maxLength: 25 }), (orders) => {
        const r = buildReport(orders, START, END);
        const completed = orders.filter((o) => o.status === "completed");
        const voided = orders.filter((o) => o.status === "voided");
        const refunded = orders.filter((o) => o.status === "refunded");
        const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
        const completedTotal = sum(completed.map((o) => o.totalRp));
        const s = r.summary;
        expect(s.netRp).toBe(completedTotal);
        expect(s.netRp).toBe(s.grossRp - s.refundedRp);
        expect(s.grossRp).toBe(completedTotal + sum(refunded.map((o) => o.totalRp)));
        expect(s.voidedRp).toBe(sum(voided.map((o) => o.totalRp)));
        expect(sum(r.payments.map((p) => p.totalRp))).toBe(s.netRp);
        expect(sum(r.hours.map((h) => h.totalRp))).toBe(s.netRp);
        expect(sum(r.payments.map((p) => p.orderCount))).toBe(s.orderCount);
        expect(sum(r.hours.map((h) => h.orderCount))).toBe(s.orderCount);
        const qty = sum(completed.flatMap((o) => o.lines.map((l) => l.qty)));
        expect(sum(r.products.map((p) => p.qty))).toBe(qty);
        expect(sum(r.products.map((p) => p.profitRp))).toBe(s.grossProfitRp - s.serviceChargeRp);
        const net = sum(completed.flatMap((o) => o.lines.map((l) => l.netTotalRp)));
        expect(net - s.hppRp).toBe(s.grossProfitRp - s.serviceChargeRp);
      }),
      { numRuns: 200 },
    );
  });
});
