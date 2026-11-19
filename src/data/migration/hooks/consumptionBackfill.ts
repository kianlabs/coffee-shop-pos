import type { DbPort } from "@/data/dbPort";
import { realToMilli } from "@/domain/stockLedger";
/**
 * Fills `order_item_consumption` for orders made before V11.
 *
 * Source: `order_item_cost_snapshots`. The old checkout (`stock.ts`) wrote one snapshot per
 * (order item, ingredient) with `qty` = recipe qty × units sold, i.e. the whole line, which is
 * the meaning of `order_item_consumption.qty_milli`. The old `sale_consumption` movements are
 * not used: they are aggregated per order and ingredient, so they cannot be split per item.
 *
 * Idempotent: only items that have no consumption row yet are filled, and the insert ignores
 * an existing (order_item_id, ingredient_id) key.
 */
export async function backfillConsumption(db: DbPort): Promise<void> {
  const rows = await db.query<{ order_item_id: string; ingredient_id: string; qty: number }>(
    `SELECT s.order_item_id AS order_item_id, s.ingredient_id AS ingredient_id, s.qty AS qty
       FROM order_item_cost_snapshots s
      WHERE NOT EXISTS (SELECT 1 FROM order_item_consumption c WHERE c.order_item_id = s.order_item_id)
      ORDER BY s.order_item_id, s.ingredient_id`,
  );
  for (const row of rows) {
    const qtyMilli = realToMilli(Number(row.qty));
    if (qtyMilli <= 0) continue;
    await db.run(
      "INSERT OR IGNORE INTO order_item_consumption (order_item_id, ingredient_id, qty_milli) VALUES (?, ?, ?)",
      [row.order_item_id, row.ingredient_id, qtyMilli],
    );
  }
}
