import { afterEach, describe, expect, it } from "vitest";
import { createOrdersRefundsHook } from "@/data/migration/hooks/ordersRefunds";
import { planRefund } from "@/domain/refund";
import { NO_LEGACY, NOW, migrate, type Db } from "./support/migrationHarness";
import { openV7WithData } from "./support/v7Fixture";
let db: Db;
afterEach(() => db.close());
async function legacyDb(): Promise<Db> {
  const d = await openV7WithData();
  // Old checkout: one snapshot per (item, ingredient) holding the whole line quantity.
  await d.run(
    `INSERT INTO order_item_cost_snapshots (id, order_item_id, ingredient_id, ingredient_name, qty, cost_per_unit_rp, line_cost_rp, created_at)
     VALUES ('s1', 'oi1', 'i1', 'Bahan i1', 2.4, 10, 24, 't'), ('s2', 'oi1', 'i3', 'Bahan i3', 0.0004, 1, 0, 't')`,
  );
  return d;
}
describe("V12 backfill order_item_consumption", () => {
  it("order lama: konsumsi terisi dalam milli dan refund mengembalikan stok", async () => {
    db = await legacyDb();
    await migrate(db, NO_LEGACY, 12);
    // 0.0004 rounds to 0 milli and is skipped (CHECK qty_milli > 0).
    const consumption = await db.query<{ ingredient_id: string; qty_milli: number }>(
      "SELECT ingredient_id, qty_milli FROM order_item_consumption WHERE order_item_id = 'oi1'",
    );
    expect(consumption).toEqual([{ ingredient_id: "i1", qty_milli: 2400 }]);
    const item = (await db.query<{ quantity: number; charge_total_rp: number; refunded_qty: number }>(
      "SELECT quantity, charge_total_rp, refunded_qty FROM order_items WHERE id = 'oi1'",
    ))[0];
    const order = {
      status: "completed",
      lines: [{
        lineId: "oi1", qty: item.quantity, chargeTotalRp: item.charge_total_rp, refundedQty: item.refunded_qty,
        consumption: consumption.map((c) => ({ ingredientId: c.ingredient_id, qtyMilli: c.qty_milli })),
      }],
    };
    const full = planRefund(order, { items: [{ lineId: "oi1", qty: 2 }] });
    expect(full.ok && full.stockReturns).toEqual([{ ingredientId: "i1", qtyMilli: 2400 }]);
    const half = planRefund(order, { items: [{ lineId: "oi1", qty: 1 }] });
    expect(half.ok && half.stockReturns).toEqual([{ ingredientId: "i1", qtyMilli: 1200 }]);
  });
  it("hook dijalankan ulang tidak menggandakan atau menimpa baris", async () => {
    db = await legacyDb();
    await migrate(db, NO_LEGACY, 12);
    await db.run("UPDATE order_item_consumption SET qty_milli = 5 WHERE order_item_id = 'oi1'");
    await createOrdersRefundsHook(() => NOW)(db);
    expect(await db.query("SELECT order_item_id, ingredient_id, qty_milli FROM order_item_consumption")).toEqual([
      { order_item_id: "oi1", ingredient_id: "i1", qty_milli: 5 },
    ]);
  });
});
