import { computeTotals, NO_PROMO, type PromoResult, type TaxConfig, type Totals } from "@/domain/taxEngine";
import { validateText } from "@/domain/validation";
import type { CartState, HeldOrderRecord, OrderType } from "./ports/shifts";

export const ORDER_TYPES: readonly OrderType[] = ["dine_in", "takeaway", "delivery"];

export type CartErrorCode = "invalid_input" | "not_found" | "empty_cart" | "held_limit" | "active_cart_not_empty" | "save_failed";
export type CartMutation = { ok: true } | { ok: false; code: CartErrorCode; message: string };

export const cartOk: CartMutation = { ok: true };
export const cartFail = (code: CartErrorCode, message: string): { ok: false; code: CartErrorCode; message: string } => ({ ok: false, code, message });

export interface CartLimits {
  tableMax: number;
  customerMax: number;
  noteMax: number;
  heldMax: number;
}

/** A new cart defaults to dine-in (Req 4.1). */
export function emptyCart(): CartState {
  return { lines: [], orderType: "dine_in", tableNo: "", customerName: "" };
}

export function lineKey(productId: string, variantId: string | null, modifierIds: readonly string[]): string {
  return [productId, variantId ?? "", [...modifierIds].sort().join(",")].join("|");
}

export function isValidQty(qty: number): boolean {
  return Number.isSafeInteger(qty) && qty >= 1;
}

export function validateTable(table: string, max: number): CartMutation {
  const value = table.trim();
  if (value !== "" && !/^[A-Za-z0-9]+$/.test(value)) return cartFail("invalid_input", "Nomor meja hanya boleh huruf dan angka.");
  const r = validateText(value, { maxLength: max, required: false, label: "Nomor meja" });
  return r.ok ? cartOk : cartFail("invalid_input", r.message);
}

export function validateLabelText(text: string, max: number, label: string): CartMutation {
  const r = validateText(text, { maxLength: max, required: false, label });
  return r.ok ? cartOk : cartFail("invalid_input", r.message);
}

/** Totals via the Tax_Engine; the cart never does its own money math. */
export function cartTotals(cart: CartState, cfg: TaxConfig, promo: PromoResult = NO_PROMO): Totals {
  const lines = cart.lines.map((l) => ({
    key: l.key, unitPriceRp: l.unitPriceRp, adjustmentsRp: l.adjustmentsRp, qty: l.qty, discount: l.discount,
  }));
  return computeTotals(lines, cart.orderDiscount, promo, cfg);
}

/** Label: customer name, else table number, else the next sequential "Pesanan N" (Req 4.4). */
export function heldLabel(cart: CartState, existing: readonly HeldOrderRecord[]): string {
  const name = cart.customerName.trim();
  if (name !== "") return name;
  const table = cart.tableNo.trim();
  if (table !== "") return table;
  const used = existing.map((h) => /^Pesanan (\d+)$/.exec(h.label)).map((m) => (m ? Number(m[1]) : 0));
  return `Pesanan ${Math.max(0, ...used) + 1}`;
}
