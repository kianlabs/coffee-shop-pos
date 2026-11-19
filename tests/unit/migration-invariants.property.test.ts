import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { realToMilli } from "@/domain/stockLedger";
import { NO_LEGACY, fkViolations, migrate, openAt, type Db } from "./support/migrationHarness";
// Property 20: migration invariant (Req 18.4): order counts per status, revenue and stock per ingredient survive.
const STATUSES = ["completed", "voided", "partially_refunded", "refunded"] as const;
const arbOrder = fc.record({
  status: fc.constantFrom(...STATUSES),
  items: fc.array(fc.record({ qty: fc.integer({ min: 1, max: 5 }), unit: fc.integer({ min: 1000, max: 90_000 }), disc: fc.integer({ min: 0, max: 900 }) }), { minLength: 1, maxLength: 4 }),
  tax: fc.integer({ min: 0, max: 20_000 }),
  methods: fc.array(fc.constantFrom("cash", "qris_manual", "other"), { minLength: 1, maxLength: 2 }),
});
/** Quantities are whole milli units, as the legacy ROUND(…, 3) kept them. */
const arbIngredient = fc.record({
  buys: fc.array(fc.integer({ min: 1, max: 5_000_000 }), { minLength: 1, maxLength: 4 }),
  uses: fc.array(fc.integer({ min: 1, max: 900_000 }), { maxLength: 4 }),
  wastes: fc.array(fc.integer({ min: 1, max: 900_000 }), { maxLength: 2 }),
});
const T = "2025-12-30T03:00:00.000Z";
async function seed(db: Db, orders: Array<fc.ValueOf<typeof arbOrder>>, ings: Array<fc.ValueOf<typeof arbIngredient>>) {
  const expectedStatus: Record<string, number> = {};
  let revenue = 0;
  for (const [n, o] of orders.entries()) {
    const gross = o.items.reduce((a, i) => a + i.qty * i.unit, 0);
    const discount = o.items.reduce((a, i) => a + i.disc, 0);
    const total = gross - discount + o.tax;
    revenue += total;
    expectedStatus[o.status] = (expectedStatus[o.status] ?? 0) + 1;
    await db.run(
      `INSERT INTO orders (id, receipt_number, idempotency_key, status, subtotal_rp, discount_rp, tax_rp, total_rp, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [`o${n}`, `R${n}`, `k${n}`, o.status, gross, discount, o.tax, total, T, T],
    );
    for (const [j, i] of o.items.entries()) {
      await db.run("INSERT INTO order_items (id, order_id, product_name_snapshot, quantity, unit_price_rp, discount_rp, line_total_rp, created_at) VALUES (?,?,?,?,?,?,?,?)",
        [`o${n}i${j}`, `o${n}`, "Kopi", i.qty, i.unit, i.disc, i.qty * i.unit, T]);
    }
    for (const [j, m] of o.methods.entries()) {
      await db.run("INSERT INTO payments (id, order_id, method, amount_rp, status, created_at) VALUES (?,?,?,?,?,?)", [`o${n}p${j}`, `o${n}`, m, 1, "paid", T]);
    }
  }
  const expectedStock: Record<string, number> = {};
  for (const [n, g] of ings.entries()) {
    const net = g.buys.reduce((a, b) => a + b, 0) - g.uses.reduce((a, b) => a + b, 0) - g.wastes.reduce((a, b) => a + b, 0);
    expectedStock[`g${n}`] = net;
    await db.run("INSERT INTO ingredients (id, name, base_unit, stock_qty, created_at) VALUES (?,?, 'g', ?, ?)", [`g${n}`, `G${n}`, net / 1000, T]);
    const moves: Array<[string, number]> = [...g.buys.map((q): [string, number] => ["purchase_received", q]), ...g.uses.map((q): [string, number] => ["sale_consumption", q]), ...g.wastes.map((q): [string, number] => ["waste", q])];
    for (const [j, [type, q]] of moves.entries()) {
      await db.run("INSERT INTO stock_movements (id, ingredient_id, qty, movement_type, created_at) VALUES (?,?,?,?,?)", [`g${n}m${j}`, `g${n}`, q / 1000, type, T]);
    }
  }
  return { expectedStatus, revenue, expectedStock };
}
describe("Properti 20: invarian migrasi V7 ke V14", () => {
  it("jumlah order per status, omzet, dan stok per bahan identik setelah migrasi", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbOrder, { minLength: 1, maxLength: 5 }), fc.array(arbIngredient, { maxLength: 3 }), async (orders, ings) => {
        const db = await openAt(7);
        try {
          await db.exec("PRAGMA foreign_keys = ON");
          const exp = await seed(db, orders, ings);
          await migrate(db, NO_LEGACY);
          const status = await db.query<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM orders GROUP BY status");
          expect(Object.fromEntries(status.map((r) => [r.status, r.n]))).toEqual(exp.expectedStatus);
          expect((await db.query<{ t: number }>("SELECT SUM(total_rp) AS t FROM orders"))[0].t).toBe(exp.revenue);
          const stock = await db.query<{ id: string; stock_milli: number }>("SELECT id, stock_milli FROM ingredients");
          expect(Object.fromEntries(stock.map((r) => [r.id, r.stock_milli]))).toEqual(exp.expectedStock);
          for (const milli of Object.values(exp.expectedStock)) expect(realToMilli(milli / 1000)).toBe(milli);
          const charge = await db.query<{ id: string; total_rp: number; c: number }>(
            "SELECT o.id AS id, o.total_rp AS total_rp, SUM(i.charge_total_rp) AS c FROM orders o JOIN order_items i ON i.order_id = o.id GROUP BY o.id");
          for (const r of charge) expect(r.c).toBe(r.total_rp);
          const refunded = orders.filter((o) => o.status === "refunded").length;
          expect((await db.query("SELECT id FROM refunds")).length).toBe(refunded);
          expect(await fkViolations(db)).toEqual([]);
        } finally {
          db.close();
        }
      }),
      { numRuns: 25 },
    );
  });
});
