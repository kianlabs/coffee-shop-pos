import type { DbPort } from "@/data/dbPort";
import type { PerfRows } from "./perfData";
const SQL = {
  products: "INSERT INTO products (id, name, base_price_rp, created_at, updated_at) VALUES (?,?,?,?,?)",
  ingredients: "INSERT INTO ingredients (id, name, base_unit, stock_milli, created_at) VALUES (?,?,?,?,?)",
  orders: "INSERT INTO orders (id, receipt_number, idempotency_key, status, subtotal_rp, tax_rp, total_rp, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
  items: "INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, quantity, unit_price_rp, line_total_rp, hpp_total_rp, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
  payments: "INSERT INTO payments (id, order_id, method, amount_rp, status, paid_at, created_at) VALUES (?,?,?,?,?,?,?)",
  movements: "INSERT INTO stock_movements (id, ingredient_id, qty_milli, movement_type, reference_type, reference_id, created_at) VALUES (?,?,?,'sale_consumption',?,?,?)",
} as const;
type Params = Parameters<DbPort["run"]>[1];
/** Loads generated rows into a migrated database inside one transaction. */
export async function insertPerfData(db: DbPort, rows: PerfRows): Promise<void> {
  await db.exec("BEGIN");
  try {
    for (const key of ["products", "ingredients", "orders", "items", "payments", "movements"] as const) {
      for (const row of rows[key]) await db.run(SQL[key], row as Params);
    }
    await db.exec("COMMIT");
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
}
