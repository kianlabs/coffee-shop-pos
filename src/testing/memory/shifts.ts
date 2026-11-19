import type { ShiftPayment, DrawerExpense } from "@/domain/shifts";
import type {
  CartState,
  CashEntryRecord,
  HeldOrderRecord,
  ShiftRecord,
  ShiftTx,
  ShiftUnitOfWork,
} from "@/services/ports/shifts";
import { createMemorySettingsDb, type MemorySettingsDb } from "./settings";

/** In-memory shift, cart, and held-order tables on top of the memory settings db. Test-only. */
export interface MemoryShiftDb {
  base: MemorySettingsDb;
  uow: ShiftUnitOfWork;
  shifts: Map<string, ShiftRecord>;
  entries: CashEntryRecord[];
  cart: CartState | null;
  held: Map<string, HeldOrderRecord>;
  /** Fixtures read by `cashFlow`. */
  payments: ShiftPayment[];
  drawerExpenses: DrawerExpense[];
  /** When true, saving the active cart throws. */
  failCartSave: boolean;
  /** When true, inserting a held order throws. */
  failHold: boolean;
}

export function createMemoryShiftDb(base: MemorySettingsDb = createMemorySettingsDb()): MemoryShiftDb {
  const db: MemoryShiftDb = {
    base,
    uow: { transact: (fn) => base.uow.transact((tx) => guarded(tx, fn)) },
    shifts: new Map(),
    entries: [],
    cart: null,
    held: new Map(),
    payments: [],
    drawerExpenses: [],
    failCartSave: false,
    failHold: false,
  };
  const inRange = (at: string, from: string, to: string): boolean => at >= from && at <= to;
  const stores = (tx: Omit<ShiftTx, "shifts" | "carts" | "heldOrders" | "cashFlow">): ShiftTx => ({
    ...tx,
    shifts: {
      findOpen: async () => clone([...db.shifts.values()].find((s) => s.status === "open") ?? null),
      get: async (id) => clone(db.shifts.get(id) ?? null),
      insert: async (shift) => {
        if (shift.status === "open" && [...db.shifts.values()].some((s) => s.status === "open")) {
          throw new Error("memory: one open shift per device");
        }
        db.shifts.set(shift.id, clone(shift));
      },
      update: async (shift) => {
        const others = [...db.shifts.values()].filter((s) => s.id !== shift.id && s.status === "open");
        if (shift.status === "open" && others.length > 0) throw new Error("memory: one open shift per device");
        db.shifts.set(shift.id, clone(shift));
      },
      entries: async (shiftId) => clone(db.entries.filter((e) => e.shiftId === shiftId)),
      addEntry: async (entry) => {
        db.entries.push(clone(entry));
      },
    },
    carts: {
      load: async () => clone(db.cart),
      save: async (cart) => {
        if (db.failCartSave) throw new Error("memory: cart save failed");
        db.cart = clone(cart);
      },
      clear: async () => {
        db.cart = null;
      },
    },
    heldOrders: {
      list: async () => clone([...db.held.values()].sort((a, b) => a.heldAt.localeCompare(b.heldAt))),
      get: async (id) => clone(db.held.get(id) ?? null),
      insert: async (order) => {
        if (db.failHold) throw new Error("memory: hold failed");
        db.held.set(order.id, clone(order));
      },
      remove: async (id) => {
        db.held.delete(id);
      },
    },
    cashFlow: {
      payments: async (from, to) => clone(db.payments.filter((p) => inRange(p.recordedAt, from, to))),
      drawerExpenses: async (from, to) => clone(db.drawerExpenses.filter((e) => inRange(e.recordedAt, from, to))),
    },
  });
  // Restores this db's tables when fn throws; the base uow restores settings and audit.
  async function guarded<T>(tx: Parameters<typeof stores>[0], fn: (tx: ShiftTx) => Promise<T>): Promise<T> {
    const snap = { shifts: clone([...db.shifts]), entries: clone(db.entries), cart: clone(db.cart), held: clone([...db.held]) };
    try {
      return await fn(stores(tx));
    } catch (e) {
      db.shifts = new Map(snap.shifts);
      db.entries = snap.entries;
      db.cart = snap.cart;
      db.held = new Map(snap.held);
      throw e;
    }
  }
  return db;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
