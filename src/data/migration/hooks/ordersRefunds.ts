import type { DbPort } from "@/data/dbPort";
import type { DataHook } from "@/data/migration/runner";
import { allocateProportional } from "./chargeAllocation";
import { migrationUserId, ownerId } from "./migrationUser";
interface OrderRow extends Record<string, unknown> {
  id: string;
  total_rp: number;
  updated_at: string;
}
interface ItemRow extends Record<string, unknown> {
  id: string;
  quantity: number;
  line_total_rp: number;
  discount_rp: number;
}
const LEGACY_ORDERS = `SELECT o.id AS id, o.total_rp AS total_rp, o.updated_at AS updated_at FROM orders o
  WHERE EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)
    AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.charge_total_rp > 0)
  ORDER BY o.id`;
async function itemsOf(db: DbPort, orderId: string): Promise<ItemRow[]> {
  return db.query<ItemRow>(
    "SELECT id, quantity, line_total_rp, discount_rp FROM order_items WHERE order_id = ? ORDER BY created_at, id",
    [orderId],
  );
}
/** `charge_total_rp` per line, allocated from the stored `orders.total_rp` by net line value. */
async function fillCharges(db: DbPort): Promise<void> {
  for (const order of await db.query<OrderRow>(LEGACY_ORDERS)) {
    const items = await itemsOf(db, order.id);
    const net = items.map((i) => Math.max(i.line_total_rp - i.discount_rp, 0));
    const charges = allocateProportional(net, order.total_rp);
    for (const [index, item] of items.entries()) {
      await db.run("UPDATE order_items SET charge_total_rp = ? WHERE id = ?", [charges[index], item.id]);
    }
  }
}
/** One synthetic full refund per old `refunded` order that has none, so net revenue stays what it was. */
async function addSyntheticRefunds(db: DbPort, now: string): Promise<void> {
  const orders = await db.query<OrderRow>(
    `SELECT id, total_rp, updated_at FROM orders
      WHERE status = 'refunded' AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.order_id = orders.id) ORDER BY id`,
  );
  if (orders.length === 0) return;
  const userId = await migrationUserId(db, now);
  for (const order of orders) {
    const refundId = `legacy-refund-${order.id}`;
    const pay = await db.query<{ method: string }>(
      "SELECT method FROM payments WHERE order_id = ? ORDER BY created_at, id LIMIT 1",
      [order.id],
    );
    await db.run(
      `INSERT OR IGNORE INTO refunds (id, order_id, idempotency_key, kind, amount_rp, method, reason, executed_by, created_at)
       VALUES (?, ?, ?, 'full', ?, ?, 'migrasi', ?, ?)`,
      [refundId, order.id, refundId, order.total_rp, pay[0]?.method ?? "cash", userId, order.updated_at],
    );
    for (const item of await db.query<{ id: string; quantity: number; charge_total_rp: number }>(
      "SELECT id, quantity, charge_total_rp FROM order_items WHERE order_id = ?",
      [order.id],
    )) {
      await db.run("INSERT OR IGNORE INTO refund_items (refund_id, order_item_id, qty, amount_rp) VALUES (?, ?, ?, ?)", [
        refundId, item.id, item.quantity, item.charge_total_rp,
      ]);
      await db.run("UPDATE order_items SET refunded_qty = ? WHERE id = ?", [item.quantity, item.id]);
    }
  }
}
/** V12 data step: order owner, line charges, synthetic refunds. Safe to run again. */
export function createOrdersRefundsHook(now: () => string): DataHook {
  return async (db) => {
    const owner = await ownerId(db);
    if (owner !== null) await db.run("UPDATE orders SET user_id = ? WHERE user_id IS NULL", [owner]);
    await fillCharges(db);
    await addSyntheticRefunds(db, now());
  };
}
