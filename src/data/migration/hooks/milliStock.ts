import type { DbPort } from "@/data/dbPort";
import { MigrationError, type DataHook } from "@/data/migration/runner";
import { NEGATIVE_TYPES, realToMilli } from "@/domain/stockLedger";
/** Legacy stock is REAL with ROUND(…, 3); a ledger that adds up to this tolerance counts as consistent. */
const LEGACY_TOLERANCE = 0.0006;
const NEGATIVE = new Set<string>(NEGATIVE_TYPES);
const sign = (type: string): number => (NEGATIVE.has(type) ? -1 : 1);
interface MovementRow extends Record<string, unknown> {
  id: string;
  ingredient_id: string | null;
  movement_type: string;
  qty: number;
}
async function convertIngredients(db: DbPort): Promise<Map<string, { real: number; milli: number }>> {
  const rows = await db.query<{ id: string; stock_qty: number }>("SELECT id, stock_qty FROM v11_ingredients");
  const stock = new Map<string, { real: number; milli: number }>();
  for (const row of rows) {
    const milli = realToMilli(Number(row.stock_qty));
    await db.run("UPDATE ingredients SET stock_milli = ? WHERE id = ?", [milli, row.id]);
    stock.set(row.id, { real: Number(row.stock_qty), milli });
  }
  return stock;
}
/** Converts every movement; returns per ingredient the legacy and the converted signed sums. */
async function convertMovements(db: DbPort): Promise<Map<string, { real: number; milli: number }>> {
  const rows = await db.query<MovementRow>(
    "SELECT id, ingredient_id, movement_type, qty FROM v11_movements",
  );
  const sums = new Map<string, { real: number; milli: number }>();
  for (const row of rows) {
    const milli = realToMilli(Number(row.qty));
    await db.run("UPDATE stock_movements SET qty_milli = ? WHERE id = ?", [milli, row.id]);
    if (row.ingredient_id === null) continue;
    const sum = sums.get(row.ingredient_id) ?? { real: 0, milli: 0 };
    sum.real += sign(row.movement_type) * Number(row.qty);
    sum.milli += sign(row.movement_type) * milli;
    sums.set(row.ingredient_id, sum);
  }
  return sums;
}
/**
 * REAL → integer milli for `ingredients.stock_milli` and `stock_movements.qty_milli`, row by row with
 * `realToMilli`. For every ingredient whose legacy ledger added up, the converted stock must equal the
 * converted movement sum; otherwise the whole version is rolled back (Req 8.8, 8.12).
 */
export const milliStockHook: DataHook = async (db) => {
  const stock = await convertIngredients(db);
  const sums = await convertMovements(db);
  for (const [ingredientId, sum] of sums) {
    const current = stock.get(ingredientId);
    if (!current || Math.abs(current.real - sum.real) > LEGACY_TOLERANCE) continue;
    if (current.milli !== sum.milli) {
      throw new MigrationError(
        `Stok bahan ${ingredientId} tidak sama dengan jumlah movement setelah konversi (${current.milli} dan ${sum.milli}).`,
      );
    }
  }
  await db.exec("DROP TABLE v11_ingredients; DROP TABLE v11_movements;");
};
