import type { Tx } from "../ports";
import type { Discount } from "@/domain/taxEngine";
import type { CashEntry, DrawerExpense, ShiftPayment } from "@/domain/shifts";

export type ShiftStatus = "open" | "closed";

/** One row of `shifts`. At most one row per device has status `open`. */
export interface ShiftRecord {
  id: string;
  openedBy: string;
  openedAt: string;
  openCashRp: number;
  status: ShiftStatus;
  closedBy: string | null;
  closedAt: string | null;
  countedCashRp: number | null;
  expectedCashRp: number | null;
  differenceRp: number | null;
  differenceReason: string | null;
}

export interface CashEntryRecord extends CashEntry {
  id: string;
  shiftId: string;
  reason: string;
  recordedAt: string;
  recordedBy: string;
}

export interface ShiftStore {
  findOpen(): Promise<ShiftRecord | null>;
  get(id: string): Promise<ShiftRecord | null>;
  /** Rejects when another open shift exists (mirrors the partial unique index). */
  insert(shift: ShiftRecord): Promise<void>;
  update(shift: ShiftRecord): Promise<void>;
  entries(shiftId: string): Promise<CashEntryRecord[]>;
  addEntry(entry: CashEntryRecord): Promise<void>;
}

/** Read-only view of payments and drawer expenses recorded between two instants. */
export interface CashFlowReader {
  payments(fromIso: string, toIso: string): Promise<ShiftPayment[]>;
  drawerExpenses(fromIso: string, toIso: string): Promise<DrawerExpense[]>;
}

export type OrderType = "dine_in" | "takeaway" | "delivery";

export interface CartLine {
  /** Stable key: productId|variantId|sorted modifierIds. */
  key: string;
  productId: string;
  variantId: string | null;
  modifierIds: string[];
  name: string;
  unitPriceRp: number;
  adjustmentsRp: number;
  qty: number;
  note: string;
  discount?: Discount;
}

export interface CartState {
  lines: CartLine[];
  orderType: OrderType;
  tableNo: string;
  customerName: string;
  orderDiscount?: Discount;
}

export interface CartStore {
  load(): Promise<CartState | null>;
  save(cart: CartState): Promise<void>;
  clear(): Promise<void>;
}

export interface HeldOrderRecord {
  id: string;
  label: string;
  heldBy: string;
  heldAt: string;
  cart: CartState;
}

export interface HeldOrderStore {
  list(): Promise<HeldOrderRecord[]>;
  get(id: string): Promise<HeldOrderRecord | null>;
  insert(order: HeldOrderRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Settings and audit stores plus shift, cart, and held-order stores in one transaction. */
export interface ShiftTx extends Tx {
  shifts: ShiftStore;
  carts: CartStore;
  heldOrders: HeldOrderStore;
  cashFlow: CashFlowReader;
}

export interface ShiftUnitOfWork {
  transact<T>(fn: (tx: ShiftTx) => Promise<T>): Promise<T>;
}
