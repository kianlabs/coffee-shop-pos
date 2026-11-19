import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildReport } from "@/domain/reports";
import type { Order } from "@/domain/orders";
import { openSqlJsDb } from "@/testing/sqlJsDb";
import { DEFAULT_PERF, generatePerfData } from "../support/perfData";
import { insertPerfData } from "../support/perfDataInsert";
import { migrate } from "./support/migrationHarness";
/**
 * Report query benchmark (task 26.4). Regression warning only: timings are
 * printed, and the asserted bound is deliberately generous (machine noise).
 * Scale up with PERF_ORDERS=50000 npx vitest run tests/unit/report-benchmark.test.ts
 */
const ORDERS = Number(process.env.PERF_ORDERS ?? 2_000);
const BOUND_MS_PER_1K_ORDERS = 500;
type Db = Awaited<ReturnType<typeof openSqlJsDb>>;
type Row = Record<string, unknown>;
const timings: Array<[string, number]> = [];
let db: Db;
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const result = await fn();
  timings.push([label, Math.round(performance.now() - t0)]);
  return result;
}
function toOrder(o: Row, items: Row[], p: Row | undefined): Order {
  return {
    id: String(o.id), receiptNumber: String(o.receipt_number), idempotencyKey: String(o.idempotency_key),
    status: o.status === "voided" ? "voided" : o.status === "refunded" ? "refunded" : "completed",
    lines: items.map((i) => ({
      productId: String(i.product_id), variantId: null, productName: String(i.product_name_snapshot), variantName: null,
      unitPriceRp: Number(i.unit_price_rp), qty: Number(i.quantity), lineTotalRp: Number(i.line_total_rp),
      discountRp: 0, netTotalRp: Number(i.line_total_rp), hppTotal: Number(i.hpp_total_rp),
    })),
    subtotalRp: Number(o.subtotal_rp), discountRp: 0, taxRp: Number(o.tax_rp), serviceChargeRp: 0, roundingRp: 0,
    totalRp: Number(o.total_rp),
    payment: { method: p?.method === "qris_manual" ? "qris_manual" : "cash", amountRp: Number(p?.amount_rp ?? o.total_rp), paidAt: String(o.created_at) },
    changeRp: 0, notes: null, createdAt: String(o.created_at),
  };
}
beforeAll(async () => {
  db = await openSqlJsDb();
  await migrate(db);
  const rows = generatePerfData({ ...DEFAULT_PERF, orders: ORDERS });
  await timed(`insert ${ORDERS} orders (+items, payments, movements)`, () => insertPerfData(db, rows));
}, 600_000);
afterAll(() => {
  db.close();
  process.stdout.write(`report benchmark, ${ORDERS} orders (ms):\n${timings.map(([l, ms]) => `  ${l}: ${ms}`).join("\n")}\n`);
});
describe("benchmark kueri laporan (sql.js, V1..V14)", () => {
  it("loadAll: tiga SELECT seperti orderRepository + buildReport 30 hari", async () => {
    const orders = await timed("SELECT orders ORDER BY created_at DESC", () => db.query("SELECT * FROM orders ORDER BY created_at DESC"));
    const items = await timed("SELECT order_items", () => db.query("SELECT * FROM order_items ORDER BY created_at ASC"));
    const pays = await timed("SELECT payments", () => db.query("SELECT * FROM payments"));
    expect(orders).toHaveLength(ORDERS);
    const domain = await timed("map rows to Order[]", async () => {
      const byOrder = new Map<string, Row[]>();
      for (const i of items) byOrder.set(String(i.order_id), [...(byOrder.get(String(i.order_id)) ?? []), i]);
      const payBy = new Map(pays.map((p) => [String(p.order_id), p]));
      return orders.map((o) => toOrder(o, byOrder.get(String(o.id)) ?? [], payBy.get(String(o.id))));
    });
    const start = new Date(DEFAULT_PERF.startIso);
    const end = new Date(start.getTime() + 30 * 86_400_000);
    const report = await timed("buildReport (30 days, all loaded)", async () => buildReport(domain, start, end));
    expect(report.summary.orderCount).toBeGreaterThan(0);
  });
  it("agregat SQL: metode bayar, produk teratas, stok per bahan", async () => {
    const from = DEFAULT_PERF.startIso;
    const to = "2024-02-01T00:00:00.000Z";
    const byMethod = await timed("payments by method (30 days)", () =>
      db.query("SELECT p.method, SUM(p.amount_rp) AS t FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.created_at >= ? AND o.created_at < ? AND o.status = 'completed' GROUP BY p.method", [from, to]));
    const top = await timed("top products (30 days)", () =>
      db.query("SELECT i.product_id, SUM(i.quantity) AS q FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.created_at >= ? AND o.created_at < ? AND o.status = 'completed' GROUP BY i.product_id ORDER BY q DESC LIMIT 10", [from, to]));
    const stock = await timed("stock movement sum per ingredient", () =>
      db.query("SELECT ingredient_id, SUM(qty_milli) AS s FROM stock_movements GROUP BY ingredient_id"));
    expect(byMethod.length).toBeGreaterThan(0);
    expect(top.length).toBeGreaterThan(0);
    expect(stock.length).toBeGreaterThan(0);
  });
  it("tiap kueri di bawah batas longgar (peringatan regresi)", () => {
    const bound = Math.max(2_000, (ORDERS / 1_000) * BOUND_MS_PER_1K_ORDERS);
    for (const [label, ms] of timings) {
      if (label.startsWith("insert")) continue;
      expect(ms, label).toBeLessThan(bound);
    }
  });
});
