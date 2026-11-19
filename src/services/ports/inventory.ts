import type { Tx } from "../ports";
import type { MovementType } from "@/domain/stockLedger";

export interface SupplierRecord {
  id: string;
  name: string;
  contact: string;
  note: string;
  createdAt: string;
}

export interface SupplierStore {
  list(): Promise<SupplierRecord[]>;
  get(id: string): Promise<SupplierRecord | null>;
  insert(supplier: SupplierRecord): Promise<void>;
}

export interface IngredientInfo {
  id: string;
  name: string;
  /** Alert threshold in milli units; null means the ingredient is not monitored. */
  minStockMilli: number | null;
}

export interface MovementRecord {
  id: string;
  ingredientId: string;
  type: MovementType;
  /** Unsigned magnitude in milli units, > 0. */
  qtyMilli: number;
  reason: string | null;
  refType: "purchase" | "stocktake" | "waste";
  refId: string;
  createdAt: string;
  createdBy: string;
}

export interface CostHistoryRecord {
  id: string;
  ingredientId: string;
  /** Rupiah per base unit (1000 milli). */
  costPerUnitRp: number;
  effectiveAt: string;
  createdAt: string;
}

export interface InventoryStore {
  ingredients(): Promise<IngredientInfo[]>;
  getIngredient(id: string): Promise<IngredientInfo | null>;
  /** System stock in milli units for every ingredient (0 when it has no movements). */
  stockByIngredient(): Promise<Record<string, number>>;
  /** Writes the movement and applies its signed quantity to system stock. */
  addMovement(movement: MovementRecord): Promise<void>;
  addCostHistory(entry: CostHistoryRecord): Promise<void>;
}

export interface PurchaseRecord {
  id: string;
  supplierId: string;
  ingredientId: string;
  qtyMilli: number;
  totalRp: number;
  unitCostRp: number;
  purchasedAt: string;
  createdBy: string;
}

export interface PurchaseStore {
  insert(purchase: PurchaseRecord): Promise<void>;
}

export interface StocktakeItem {
  ingredientId: string;
  systemMilli: number;
  countedMilli: number;
}

export interface StocktakeRecord {
  id: string;
  completedAt: string;
  completedBy: string;
  items: StocktakeItem[];
}

export interface StocktakeStore {
  insert(stocktake: StocktakeRecord): Promise<void>;
}

export interface InventoryTx extends Tx {
  inventory: InventoryStore;
  suppliers: SupplierStore;
  purchases: PurchaseStore;
  stocktakes: StocktakeStore;
}

export interface InventoryUnitOfWork {
  transact<T>(fn: (tx: InventoryTx) => Promise<T>): Promise<T>;
}
