import type { OrderLineRecord } from "@/services/ports/orders";
import type { DbPort } from "../dbPort";
import { parseLineMeta } from "./orderSql";
import { writeInTx } from "../tx";
const INSERT_ITEM = `INSERT INTO order_items
  (id, order_id, product_id, product_name_snapshot, quantity, unit_price_rp, discount_rp, line_total_rp,
   hpp_total_rp, created_at, hpp_unit_rp, hpp_source, hpp_detail_json, charge_total_rp, refunded_qty)
  VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'snapshot', ?, ?, ?)`;
const INSERT_MODIFIER = `INSERT INTO order_item_modifiers (id, order_item_id, modifier_id, name_snapshot, price_delta_rp)
  VALUES (?, ?, ?, ?, ?)`;
const INSERT_CONSUMPTION = "INSERT INTO order_item_consumption (order_item_id, ingredient_id, qty_milli) VALUES (?, ?, ?)";
interface ItemRow {
  id: string;
  product_id: string;
  product_name_snapshot: string;
  quantity: number;
  unit_price_rp: number;
  charge_total_rp: number;
  hpp_unit_rp: number;
  hpp_detail_json: string | null;
  refunded_qty: number;
}
export async function insertLines(db: DbPort, orderId: string, createdAt: string, lines: OrderLineRecord[]): Promise<void> {
  for (const l of lines) {
    const meta = JSON.stringify({ key: l.key, adjustmentsRp: l.adjustmentsRp });
    await writeInTx(db, INSERT_ITEM, [
      l.lineId, orderId, l.productId, l.name, l.qty, l.unitPriceRp, (l.unitPriceRp + l.adjustmentsRp) * l.qty,
      l.hppRp * l.qty, createdAt, l.hppRp, meta, l.chargeTotalRp, l.refundedQty,
    ]);
    for (const [i, m] of l.modifiers.entries()) {
      await writeInTx(db, INSERT_MODIFIER, [`${l.lineId}:${i}`, l.lineId, m.modifierId, m.name, m.priceDeltaRp]);
    }
    for (const c of l.consumption) await writeInTx(db, INSERT_CONSUMPTION, [l.lineId, c.ingredientId, c.qtyMilli]);
  }
}
export async function loadLines(db: DbPort, orderId: string): Promise<OrderLineRecord[]> {
  const items = await db.query<ItemRow & Record<string, unknown>>(
    `SELECT id, product_id, product_name_snapshot, quantity, unit_price_rp, charge_total_rp, hpp_unit_rp, hpp_detail_json, refunded_qty
     FROM order_items WHERE order_id = ? ORDER BY rowid`,
    [orderId],
  );
  const mods = await db.query<{ order_item_id: string; modifier_id: string | null; name_snapshot: string; price_delta_rp: number }>(
    `SELECT m.order_item_id, m.modifier_id, m.name_snapshot, m.price_delta_rp FROM order_item_modifiers m
     JOIN order_items i ON i.id = m.order_item_id WHERE i.order_id = ? ORDER BY m.rowid`,
    [orderId],
  );
  const cons = await db.query<{ order_item_id: string; ingredient_id: string; qty_milli: number }>(
    `SELECT c.order_item_id, c.ingredient_id, c.qty_milli FROM order_item_consumption c
     JOIN order_items i ON i.id = c.order_item_id WHERE i.order_id = ? ORDER BY c.rowid`,
    [orderId],
  );
  return items.map((r) => {
    const meta = parseLineMeta(r.hpp_detail_json);
    return {
      lineId: r.id,
      key: meta.key,
      productId: r.product_id,
      name: r.product_name_snapshot,
      qty: r.quantity,
      unitPriceRp: r.unit_price_rp,
      adjustmentsRp: meta.adjustmentsRp,
      chargeTotalRp: r.charge_total_rp,
      hppRp: r.hpp_unit_rp,
      modifiers: mods
        .filter((m) => m.order_item_id === r.id)
        .map((m) => ({ modifierId: m.modifier_id ?? "", name: m.name_snapshot, priceDeltaRp: m.price_delta_rp })),
      consumption: cons.filter((c) => c.order_item_id === r.id).map((c) => ({ ingredientId: c.ingredient_id, qtyMilli: c.qty_milli })),
      refundedQty: r.refunded_qty,
    };
  });
}
