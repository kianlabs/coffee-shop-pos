import type { DbPort, SqlParam } from "@/data/dbPort";
import { openAt, type Db } from "./migrationHarness";
const T = "2025-12-30T03:00:00.000Z";
const run = (db: DbPort, sql: string, params: SqlParam[]) => db.run(sql, params);
async function order(db: DbPort, id: string, status: string, subtotal: number, discount: number, tax: number, total: number) {
  await run(
    db,
    `INSERT INTO orders (id, receipt_number, idempotency_key, status, subtotal_rp, discount_rp, tax_rp, service_charge_rp, total_rp, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [id, `R-${id}`, `idem-${id}`, status, subtotal, discount, tax, total, T, T],
  );
}
async function item(db: DbPort, id: string, orderId: string, qty: number, unit: number) {
  await run(
    db,
    `INSERT INTO order_items (id, order_id, product_name_snapshot, quantity, unit_price_rp, line_total_rp, created_at)
     VALUES (?, ?, 'Kopi', ?, ?, ?, ?)`,
    [id, orderId, qty, unit, qty * unit, T],
  );
}
async function payment(db: DbPort, id: string, orderId: string, method: string, amount: number, status: string) {
  await run(db, "INSERT INTO payments (id, order_id, method, amount_rp, status, paid_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    id, orderId, method, amount, status, T, T,
  ]);
}
async function ingredient(db: DbPort, id: string, stock: number) {
  await run(db, "INSERT INTO ingredients (id, name, base_unit, stock_qty, created_at) VALUES (?, ?, 'g', ?, ?)", [id, `Bahan ${id}`, stock, T]);
}
async function movement(db: DbPort, id: string, ing: string, qty: number, type: string, ref: [string, string] | [null, null]) {
  await run(
    db,
    "INSERT INTO stock_movements (id, ingredient_id, qty, movement_type, reference_type, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, ing, qty, type, ref[0], ref[1], T],
  );
}
/** Same payments rebuild as `ensureV3Columns` in db.ts: allows the 'voided' status. */
async function allowVoidedPayments(db: DbPort): Promise<void> {
  await db.exec(`CREATE TABLE payments_v3 (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
    method TEXT NOT NULL CHECK (method IN ('cash','qris_manual','other')), amount_rp INTEGER NOT NULL CHECK (amount_rp >= 0),
    status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','refunded','voided')), reference_note TEXT, paid_at TEXT, created_at TEXT NOT NULL);
    DROP TABLE payments; ALTER TABLE payments_v3 RENAME TO payments; CREATE INDEX idx_payments_order ON payments(order_id);`);
}
/** Expected values after migration, derived from what the fixture inserts. */
export const V7_EXPECTED = {
  ordersByStatus: { completed: 1, voided: 1, refunded: 1, partially_refunded: 1 } as Record<string, number>,
  revenueRp: 36_000 + 18_000 + 27_000 + 54_000,
  stockMilli: { i1: 7500, i2: 2, i3: 5000, i4: -250 } as Record<string, number>,
  movementMilli: { m1: 10000, m2: 2400, m3: 100, m4: 1001, m5: 999, m6: 250 } as Record<string, number>,
  paymentIds: ["p1", "p2", "p3", "p4", "p5"],
};
/** A V7 database with sample orders, payments (one voided), fractional REAL stock and a ledger. */
export async function openV7WithData(): Promise<Db> {
  const db = await openAt(7);
  await allowVoidedPayments(db);
  await order(db, "o1", "completed", 36_000, 0, 0, 36_000);
  await order(db, "o2", "voided", 18_000, 0, 0, 18_000);
  await order(db, "o3", "refunded", 25_000, 0, 2_000, 27_000);
  await order(db, "o4", "partially_refunded", 50_000, 5_000, 9_000, 54_000);
  await item(db, "oi1", "o1", 2, 18_000);
  await item(db, "oi2", "o2", 1, 18_000);
  await item(db, "oi3", "o3", 1, 25_000);
  await item(db, "oi4", "o4", 3, 10_000);
  await item(db, "oi5", "o4", 1, 20_000);
  await payment(db, "p1", "o1", "cash", 20_000, "paid");
  await payment(db, "p2", "o1", "qris_manual", 16_000, "paid");
  await payment(db, "p3", "o2", "cash", 18_000, "voided");
  await payment(db, "p4", "o3", "other", 27_000, "refunded");
  await payment(db, "p5", "o4", "cash", 54_000, "paid");
  for (const [id, stock] of [["i1", 7.5], ["i2", 0.002], ["i3", 5], ["i4", -0.25]] as const) await ingredient(db, id, stock);
  await movement(db, "m1", "i1", 10, "purchase_received", [null, null]);
  await movement(db, "m2", "i1", 2.4, "sale_consumption", ["order", "o1"]);
  await movement(db, "m3", "i1", 0.1, "waste", [null, null]);
  await movement(db, "m4", "i2", 1.0005, "purchase_received", [null, null]);
  await movement(db, "m5", "i2", 0.999, "sale_consumption", ["order", "o4"]);
  await movement(db, "m6", "i4", 0.25, "sale_consumption", ["order", "o3"]);
  return db;
}
