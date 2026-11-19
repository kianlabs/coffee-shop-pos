import type { PurchaseStore, StocktakeStore } from "@/services/ports/inventory";
import type { DbPort } from "../dbPort";
import { writeInTx } from "../tx";
const INSERT_PURCHASE = `INSERT INTO stock_purchases (id, supplier_id, ingredient_id, qty_milli, total_rp, user_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;
const INSERT_STOCKTAKE = "INSERT INTO stocktakes (id, user_id, created_at) VALUES (?, ?, ?)";
const INSERT_ITEM = "INSERT INTO stocktake_items (stocktake_id, ingredient_id, system_milli, physical_milli) VALUES (?, ?, ?, ?)";
/**
 * PurchaseStore over `stock_purchases` (V13). The table has no unit-cost column: cost per unit lives in
 * `ingredient_cost_history`, and `purchasedAt` is stored as `created_at`.
 */
export function createPurchaseRepo(db: DbPort): PurchaseStore {
  return {
    insert: (p) => writeInTx(db, INSERT_PURCHASE, [p.id, p.supplierId, p.ingredientId, p.qtyMilli, p.totalRp, p.createdBy, p.purchasedAt]),
  };
}
/** StocktakeStore over `stocktakes` and `stocktake_items` (V13). */
export function createStocktakeRepo(db: DbPort): StocktakeStore {
  return {
    async insert(s) {
      await writeInTx(db, INSERT_STOCKTAKE, [s.id, s.completedBy, s.completedAt]);
      for (const item of s.items) {
        await writeInTx(db, INSERT_ITEM, [s.id, item.ingredientId, item.systemMilli, item.countedMilli]);
      }
    },
  };
}
