import type { StockStore } from "@/services/ports/orders";
import type { DbPort } from "../dbPort";
import { writeInTx } from "../tx";
import { mapDuplicate } from "./orderSql";
const INSERT = `INSERT INTO stock_movements
  (id, ingredient_id, qty_milli, movement_type, reference_type, reference_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;
/**
 * Append-only movements in integer milli units. The partial unique index
 * `uq_stock_movements_ref` rejects a second movement for the same
 * (reference, type, ingredient), so a replay can never double-count stock.
 */
export function createStockRepo(db: DbPort): StockStore {
  return {
    async append(rows) {
      for (const m of rows) {
        await mapDuplicate(
          () => writeInTx(db, INSERT, [m.id, m.ingredientId, m.qtyMilli, m.type, m.referenceType, m.referenceId, m.createdAt]),
          ["stock_movements.reference_id"],
          "sql: duplicate stock movement reference",
        );
      }
    },
  };
}
