import { type Shift } from "@/domain/shifts";
import { type CartLine, type HeldOrder } from "./cartTypes";

// Storage keys and formats are unchanged from the previous App.tsx so carts,
// held orders, and open shifts survive the upgrade.
const CART_KEY = "pos.cart.v1";
const HELD_KEY = "pos_held_orders";
const SHIFT_KEY = "pos.shift.v1";

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full: state stays in memory; the cashier keeps working.
  }
}

function isCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.productId === "string" &&
    o.productId.length > 0 &&
    typeof o.productName === "string" &&
    o.productName.length > 0 &&
    typeof o.unitPriceRp === "number" &&
    Number.isInteger(o.unitPriceRp) &&
    o.unitPriceRp >= 0 &&
    typeof o.qty === "number" &&
    Number.isInteger(o.qty) &&
    o.qty > 0 &&
    (o.variantId === null || typeof o.variantId === "string") &&
    (o.variantName === null || typeof o.variantName === "string")
  );
}

export function loadStoredCart(): CartLine[] {
  const parsed = readJson(CART_KEY);
  return Array.isArray(parsed) ? parsed.filter(isCartLine) : [];
}

export function saveStoredCart(lines: CartLine[]): void {
  writeJson(CART_KEY, lines);
}

function isHeldOrder(value: unknown): value is HeldOrder {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return typeof o.id === "string" && Array.isArray(o.cart) && o.cart.every(isCartLine);
}

export function loadHeldOrders(): HeldOrder[] {
  const parsed = readJson(HELD_KEY);
  return Array.isArray(parsed) ? parsed.filter(isHeldOrder) : [];
}

export function saveHeldOrders(held: HeldOrder[]): void {
  writeJson(HELD_KEY, held);
}

export function loadStoredShift(): Shift | null {
  const o = readJson(SHIFT_KEY) as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  if (typeof o.id !== "string" || typeof o.openedAt !== "string") return null;
  return {
    id: o.id,
    cashierName: typeof o.cashierName === "string" ? o.cashierName : "",
    openedAt: o.openedAt,
    closedAt: typeof o.closedAt === "string" ? o.closedAt : null,
    openCashRp: typeof o.openCashRp === "number" ? o.openCashRp : 0,
  };
}

export function saveStoredShift(shift: Shift | null): void {
  if (shift) {
    writeJson(SHIFT_KEY, shift);
    return;
  }
  try {
    localStorage.removeItem(SHIFT_KEY);
  } catch {
    // Ignore: a stale shift is re-validated on next load.
  }
}
