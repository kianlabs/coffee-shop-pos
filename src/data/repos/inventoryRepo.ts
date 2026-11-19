import { signedQty } from "@/domain/stockLedger";
import { nameKey } from "@/domain/validation";
import type { InventoryStore, InventoryTx, InventoryUnitOfWork, SupplierRecord, SupplierStore } from "@/services/ports/inventory";
import type { DbPort } from "../dbPort";
import { withPortTransaction, writeInTx } from "../tx";
import { createPurchaseRepo, createStocktakeRepo } from "./purchaseRepo";
import { createAuditRepo, createSettingsRepo } from "./settingsRepo";
const INSERT_MOVEMENT = `INSERT INTO stock_movements
  (id, ingredient_id, product_id, qty_milli, movement_type, reference_type, reference_id, reason, actor, created_at)
  VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`;
const INSERT_COST = "INSERT INTO ingredient_cost_history (id, ingredient_id, cost_per_unit_rp, effective_at, created_at) VALUES (?, ?, ?, ?, ?)";
const INSERT_SUPPLIER = "INSERT INTO suppliers (id, name, name_ci, contact, note, created_at) VALUES (?, ?, ?, ?, ?, ?)";
type IngredientRow = { id: string; name: string; min_stock_milli: number | null };
type SupplierRow = { id: string; name: string; contact: string | null; note: string | null; created_at: string };
const toIngredient = (r: IngredientRow) => ({ id: r.id, name: r.name, minStockMilli: r.min_stock_milli });
const toSupplier = (r: SupplierRow): SupplierRecord => ({
  id: r.id, name: r.name, contact: r.contact ?? "", note: r.note ?? "", createdAt: r.created_at,
});
/**
 * InventoryStore over `ingredients`, `stock_movements`, and `ingredient_cost_history`. Movement quantities are
 * unsigned milli units; `ingredients.stock_milli` is moved by the signed amount in the same transaction.
 */
export function createInventoryRepo(db: DbPort): InventoryStore {
  return {
    async ingredients() {
      return (await db.query<IngredientRow>("SELECT id, name, min_stock_milli FROM ingredients ORDER BY rowid")).map(toIngredient);
    },
    async getIngredient(id) {
      const rows = await db.query<IngredientRow>("SELECT id, name, min_stock_milli FROM ingredients WHERE id = ?", [id]);
      return rows[0] ? toIngredient(rows[0]) : null;
    },
    async stockByIngredient() {
      const rows = await db.query<{ id: string; stock_milli: number }>("SELECT id, stock_milli FROM ingredients");
      return Object.fromEntries(rows.map((r) => [r.id, r.stock_milli]));
    },
    async addMovement(m) {
      const delta = signedQty(m.type, m.qtyMilli);
      await writeInTx(db, INSERT_MOVEMENT, [m.id, m.ingredientId, m.qtyMilli, m.type, m.refType, m.refId, m.reason, m.createdBy, m.createdAt]);
      await writeInTx(db, "UPDATE ingredients SET stock_milli = stock_milli + ? WHERE id = ?", [delta, m.ingredientId]);
    },
    addCostHistory: (e) => writeInTx(db, INSERT_COST, [e.id, e.ingredientId, e.costPerUnitRp, e.effectiveAt, e.createdAt]),
  };
}
/** SupplierStore over `suppliers`; the case-insensitive name is kept in `name_ci` (unique). */
export function createSupplierRepo(db: DbPort): SupplierStore {
  const columns = "id, name, contact, note, created_at";
  return {
    async list() {
      return (await db.query<SupplierRow>(`SELECT ${columns} FROM suppliers ORDER BY rowid`)).map(toSupplier);
    },
    async get(id) {
      const rows = await db.query<SupplierRow>(`SELECT ${columns} FROM suppliers WHERE id = ?`, [id]);
      return rows[0] ? toSupplier(rows[0]) : null;
    },
    insert: (s) => writeInTx(db, INSERT_SUPPLIER, [s.id, s.name, nameKey(s.name), s.contact, s.note, s.createdAt]),
  };
}
/** One serialized SQLite transaction exposing settings, audit, inventory, suppliers, purchases, and stocktakes. */
export function createInventoryUnitOfWork(db: DbPort): InventoryUnitOfWork {
  const tx: InventoryTx = {
    settings: createSettingsRepo(db),
    audit: createAuditRepo(db),
    inventory: createInventoryRepo(db),
    suppliers: createSupplierRepo(db),
    purchases: createPurchaseRepo(db),
    stocktakes: createStocktakeRepo(db),
  };
  return { transact: (fn) => withPortTransaction(db, () => fn(tx)) };
}
