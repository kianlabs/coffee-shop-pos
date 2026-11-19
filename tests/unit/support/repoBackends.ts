import { createInventoryUnitOfWork } from "@/data/repos/inventoryRepo";
import { createShiftUnitOfWork } from "@/data/repos/shiftRepo";
import { createUnitOfWork } from "@/data/unitOfWork";
import type { UnitOfWork } from "@/services/ports";
import type { InventoryUnitOfWork } from "@/services/ports/inventory";
import type { ShiftUnitOfWork } from "@/services/ports/shifts";
import { createMemoryInventoryDb } from "@/testing/memory/inventory";
import { createMemoryShiftDb } from "@/testing/memory/shifts";
import { migrate, type Db } from "./migrationHarness";
import { openSqlJsDb } from "@/testing/sqlJsDb";
export type BackendKind = "memory" | "sql";
export const BACKENDS: BackendKind[] = ["memory", "sql"];
const NOW = "2026-11-19T00:00:00.000Z";
/** Real schema (all migration steps) with foreign keys ON. */
export async function openMigratedDb(): Promise<Db> {
  const db = await openSqlJsDb();
  await migrate(db);
  await db.exec("PRAGMA foreign_keys = ON");
  return db;
}
export async function seedUsers(db: Db, ids: string[]): Promise<void> {
  for (const id of ids) {
    await db.run(
      "INSERT INTO users (id, display_name, display_name_ci, role, pin_hash, is_active, created_at, updated_at) VALUES (?, ?, ?, 'kasir', '!', 1, ?, ?)",
      [id, id, id, NOW, NOW],
    );
  }
}
export interface ShiftBackend {
  kind: BackendKind;
  uow: ShiftUnitOfWork;
  settingsUow: UnitOfWork;
  /** Same data, new repositories (what happens after the app restarts). */
  reopen(): ShiftBackend;
  addCashSale(amountRp: number, at: string, changeRp?: number): Promise<void>;
  addCashRefund(amountRp: number, at: string): Promise<void>;
  addOtherSale(method: string, amountRp: number, at: string): Promise<void>;
  addVoidedCashSale(amountRp: number, at: string): Promise<void>;
  addDrawerExpense(amountRp: number, at: string): Promise<void>;
  /** Makes saving the active cart / inserting a held order / appending audit fail until turned off. */
  breakCartSave(on: boolean): Promise<void>;
  breakHold(on: boolean): Promise<void>;
  breakAudit(on: boolean): Promise<void>;
  /** Number of held orders in storage. */
  heldCount(): Promise<number>;
  close(): void;
}
export async function createShiftBackend(kind: BackendKind, users: string[]): Promise<ShiftBackend> {
  if (kind === "memory") return memoryShift();
  const db = await openMigratedDb();
  await seedUsers(db, users);
  return sqlShift(db);
}
function memoryShift(): ShiftBackend {
  const mem = createMemoryShiftDb();
  const be: ShiftBackend = {
    kind: "memory", uow: mem.uow, settingsUow: mem.base.uow, reopen: () => be,
    addCashSale: async (amountRp, recordedAt) => void mem.payments.push({ method: "cash", amountRp, recordedAt, kind: "sale" }),
    addCashRefund: async (amountRp, recordedAt) => void mem.payments.push({ method: "cash", amountRp, recordedAt, kind: "refund" }),
    addOtherSale: async (method, amountRp, recordedAt) => void mem.payments.push({ method, amountRp, recordedAt, kind: "sale" }),
    addVoidedCashSale: async (amountRp, recordedAt) => void mem.payments.push({ method: "cash", amountRp, recordedAt, kind: "sale", status: "voided" }),
    addDrawerExpense: async (amountRp, recordedAt) => void mem.drawerExpenses.push({ amountRp, recordedAt }),
    breakCartSave: async (on) => void (mem.failCartSave = on),
    breakHold: async (on) => void (mem.failHold = on),
    breakAudit: async (on) => void (mem.base.failAudit = on),
    heldCount: async () => mem.held.size,
    close: () => undefined,
  };
  return be;
}
let seq = 0;
async function insertOrder(db: Db, changeRp: number, at: string): Promise<string> {
  const id = `ord-${++seq}`;
  await db.run(
    `INSERT INTO orders (id, receipt_number, idempotency_key, status, subtotal_rp, total_rp, change_rp, created_at, updated_at)
     VALUES (?, ?, ?, 'completed', 0, 0, ?, ?, ?)`,
    [id, `R-${id}`, `k-${id}`, changeRp, at, at],
  );
  return id;
}
async function insertPayment(db: Db, orderId: string, method: string, amountRp: number, status: string, at: string): Promise<void> {
  await db.run(
    "INSERT INTO payments (id, order_id, method, amount_rp, status, paid_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [`pay-${orderId}-${method}-${++seq}`, orderId, method, amountRp, status, at, at],
  );
}
const trigger = (db: Db, name: string, table: string) =>
  `CREATE TRIGGER ${name} BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'rusak'); END`;
async function toggle(db: Db, name: string, table: string, on: boolean): Promise<void> {
  await db.exec(`DROP TRIGGER IF EXISTS ${name}`);
  if (on) await db.exec(trigger(db, name, table));
}
export function sqlShift(db: Db): ShiftBackend {
  const be: ShiftBackend = {
    kind: "sql", uow: createShiftUnitOfWork(db), settingsUow: createUnitOfWork(db),
    reopen: () => sqlShift(db),
    addCashSale: async (amountRp, at, changeRp = 0) => insertPayment(db, await insertOrder(db, changeRp, at), "cash", amountRp + changeRp, "paid", at),
    addCashRefund: async (amountRp, at) => {
      const order = await insertOrder(db, 0, "2026-01-01T00:00:00.000Z");
      await db.run(
        `INSERT INTO refunds (id, order_id, idempotency_key, kind, amount_rp, method, reason, executed_by, created_at)
         VALUES (?, ?, ?, 'partial', ?, 'cash', 'tes', 'u-kasir', ?)`,
        [`rf-${order}`, order, `rk-${order}`, amountRp, at],
      );
    },
    addOtherSale: async (method, amountRp, at) => insertPayment(db, await insertOrder(db, 0, at), method, amountRp, "paid", at),
    addVoidedCashSale: async (amountRp, at) => insertPayment(db, await insertOrder(db, 0, at), "cash", amountRp, "voided", at),
    addDrawerExpense: async (amountRp, at) => {
      const shift = (await db.query<{ id: string }>("SELECT id FROM shifts WHERE status = 'terbuka'"))[0];
      await db.run("INSERT INTO cash_entries (id, shift_id, kind, amount_rp, reason, user_id, created_at) VALUES (?, ?, 'expense', ?, 'biaya', 'u-kasir', ?)",
        [`exp-${++seq}`, shift.id, amountRp, at]);
    },
    breakCartSave: (on) => toggle(db, "t_cart", "carts", on),
    breakHold: (on) => toggle(db, "t_hold", "held_orders", on),
    breakAudit: (on) => toggle(db, "t_audit", "audit_logs", on),
    heldCount: async () => (await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM held_orders"))[0].n,
    close: () => db.close(),
  };
  return be;
}
export interface InventoryBackend {
  kind: BackendKind;
  uow: InventoryUnitOfWork;
  settingsUow: UnitOfWork;
  reopen(): InventoryBackend;
  seedIngredients(): Promise<void>;
  breakMovements(on: boolean): Promise<void>;
  /** Count of rows in movements, purchases, cost history. */
  counts(): Promise<{ movements: number; purchases: number; cost: number; stocktakes: number; suppliers: number }>;
  close(): void;
}
const INGREDIENTS = [["kopi", "Biji kopi", 500_000], ["susu", "Susu", null]] as const;
export async function createInventoryBackend(kind: BackendKind, users: string[]): Promise<InventoryBackend> {
  if (kind === "memory") return memoryInventory();
  const db = await openMigratedDb();
  await seedUsers(db, users);
  return sqlInventory(db);
}
function memoryInventory(): InventoryBackend {
  const mem = createMemoryInventoryDb();
  const be: InventoryBackend = {
    kind: "memory", uow: mem.uow, settingsUow: mem.base.uow, reopen: () => be,
    seedIngredients: async () => {
      for (const [id, name, min] of INGREDIENTS) mem.ingredients.set(id, { id, name, minStockMilli: min });
    },
    breakMovements: async (on) => void (mem.failMovements = on),
    counts: async () => ({ movements: mem.movements.length, purchases: mem.purchases.length, cost: mem.costHistory.length, stocktakes: mem.stocktakes.length, suppliers: mem.suppliers.size }),
    close: () => undefined,
  };
  return be;
}
export function sqlInventory(db: Db): InventoryBackend {
  const count = async (t: string): Promise<number> => (await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`))[0].n;
  const be: InventoryBackend = {
    kind: "sql", uow: createInventoryUnitOfWork(db), settingsUow: createUnitOfWork(db), reopen: () => sqlInventory(db),
    seedIngredients: async () => {
      for (const [id, name, min] of INGREDIENTS) {
        await db.run("INSERT INTO ingredients (id, name, base_unit, stock_milli, min_stock_milli, created_at) VALUES (?, ?, 'g', 0, ?, ?)", [id, name, min, NOW]);
      }
    },
    breakMovements: (on) => toggle(db, "t_mov", "stock_movements", on),
    counts: async () => ({
      movements: await count("stock_movements"), purchases: await count("stock_purchases"), cost: await count("ingredient_cost_history"),
      stocktakes: await count("stocktakes"), suppliers: await count("suppliers"),
    }),
    close: () => db.close(),
  };
  return be;
}
