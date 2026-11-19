import { signedQty } from "@/domain/stockLedger";
import type {
  CostHistoryRecord, IngredientInfo, InventoryTx, InventoryUnitOfWork, MovementRecord, PurchaseRecord, StocktakeRecord, SupplierRecord,
} from "@/services/ports/inventory";
import { createMemorySettingsDb, type MemorySettingsDb } from "./settings";

/** In-memory inventory tables on top of the memory settings db. Test-only. */
export interface MemoryInventoryDb {
  base: MemorySettingsDb;
  uow: InventoryUnitOfWork;
  ingredients: Map<string, IngredientInfo>;
  /** Running system stock, updated on each movement (like the SQL stock column). */
  stock: Map<string, number>;
  movements: MovementRecord[];
  costHistory: CostHistoryRecord[];
  suppliers: Map<string, SupplierRecord>;
  purchases: PurchaseRecord[];
  stocktakes: StocktakeRecord[];
  /** When true, every movement insert throws. */
  failMovements: boolean;
}

export function createMemoryInventoryDb(base: MemorySettingsDb = createMemorySettingsDb()): MemoryInventoryDb {
  const db: MemoryInventoryDb = {
    base, uow: { transact: (fn) => base.uow.transact((tx) => guarded(tx, fn)) },
    ingredients: new Map(), stock: new Map(), movements: [], costHistory: [], suppliers: new Map(),
    purchases: [], stocktakes: [], failMovements: false,
  };
  const stores = (tx: Omit<InventoryTx, "inventory" | "suppliers" | "purchases" | "stocktakes">): InventoryTx => ({
    ...tx,
    inventory: {
      ingredients: async () => clone([...db.ingredients.values()]),
      getIngredient: async (id) => clone(db.ingredients.get(id) ?? null),
      stockByIngredient: async () => Object.fromEntries([...db.ingredients.keys()].map((id) => [id, db.stock.get(id) ?? 0])),
      addMovement: async (m) => {
        if (db.failMovements) throw new Error("memory: movement insert failed");
        db.movements.push(clone(m));
        db.stock.set(m.ingredientId, (db.stock.get(m.ingredientId) ?? 0) + signedQty(m.type, m.qtyMilli));
      },
      addCostHistory: async (e) => {
        db.costHistory.push(clone(e));
      },
    },
    suppliers: {
      list: async () => clone([...db.suppliers.values()]),
      get: async (id) => clone(db.suppliers.get(id) ?? null),
      insert: async (s) => {
        db.suppliers.set(s.id, clone(s));
      },
    },
    purchases: { insert: async (p) => void db.purchases.push(clone(p)) },
    stocktakes: { insert: async (s) => void db.stocktakes.push(clone(s)) },
  });
  async function guarded<T>(tx: Parameters<typeof stores>[0], fn: (tx: InventoryTx) => Promise<T>): Promise<T> {
    const snap = {
      stock: new Map(db.stock), movements: db.movements.length, costHistory: db.costHistory.length,
      suppliers: new Map(db.suppliers), purchases: db.purchases.length, stocktakes: db.stocktakes.length,
    };
    try {
      return await fn(stores(tx));
    } catch (e) {
      db.stock = snap.stock;
      db.movements.length = snap.movements;
      db.costHistory.length = snap.costHistory;
      db.suppliers = snap.suppliers;
      db.purchases.length = snap.purchases;
      db.stocktakes.length = snap.stocktakes;
      throw e;
    }
  }
  return db;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
