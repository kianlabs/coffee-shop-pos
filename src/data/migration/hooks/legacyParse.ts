/** Parsing and validation of the legacy localStorage JSON. Pure: no storage access. */
export interface LegacyCartLine {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPriceRp: number;
  qty: number;
}
export interface LegacyShift {
  id: string;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  openCashRp: number;
}
export interface LegacyHeld {
  id: string;
  lines: LegacyCartLine[];
  notes: string;
  orderType: "dine_in" | "takeaway";
  discount: number;
  tax: number;
  total: number;
  heldAt: string | null;
}
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isIsoDate = (v: unknown): v is string => typeof v === "string" && v !== "" && !Number.isNaN(Date.parse(v));
const nonNegInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const nullableString = (v: unknown): v is string | null => v === null || typeof v === "string";
export function parseJson(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
export function toCartLine(v: unknown): LegacyCartLine | null {
  if (!isRecord(v)) return null;
  const { productId, productName, unitPriceRp, qty } = v;
  if (typeof productId !== "string" || productId === "" || typeof productName !== "string" || productName === "") return null;
  if (!nonNegInt(unitPriceRp) || !nonNegInt(qty) || qty === 0) return null;
  const variantId = v.variantId ?? null;
  const variantName = v.variantName ?? null;
  if (!nullableString(variantId) || !nullableString(variantName)) return null;
  return { productId, variantId, productName, variantName, unitPriceRp, qty };
}
export function toShift(v: unknown): LegacyShift | null {
  if (!isRecord(v) || typeof v.id !== "string" || v.id === "" || !isIsoDate(v.openedAt)) return null;
  return {
    id: v.id,
    cashierName: typeof v.cashierName === "string" ? v.cashierName : "",
    openedAt: v.openedAt,
    closedAt: isIsoDate(v.closedAt) ? v.closedAt : null,
    openCashRp: nonNegInt(v.openCashRp) ? v.openCashRp : 0,
  };
}
/** `dine-in` → `dine_in`, `take-away` → `takeaway`; anything else is not a legacy order type. */
export function mapOrderType(v: unknown): LegacyHeld["orderType"] | null {
  if (v === "dine-in" || v === "dine_in") return "dine_in";
  if (v === "take-away" || v === "takeaway") return "takeaway";
  return null;
}
export function toHeld(v: unknown): LegacyHeld | null {
  if (!isRecord(v) || typeof v.id !== "string" || v.id === "" || !Array.isArray(v.cart)) return null;
  const lines = v.cart.map(toCartLine);
  const orderType = v.orderType === undefined ? "dine_in" : mapOrderType(v.orderType);
  if (orderType === null || lines.length === 0 || lines.some((l) => l === null)) return null;
  return {
    id: v.id,
    lines: lines as LegacyCartLine[],
    notes: typeof v.notes === "string" ? v.notes : "",
    orderType,
    discount: nonNegInt(v.discount) ? v.discount : 0,
    tax: nonNegInt(v.tax) ? v.tax : 0,
    total: nonNegInt(v.total) ? v.total : 0,
    heldAt: isIsoDate(v.heldAt) ? v.heldAt : null,
  };
}
/** FNV-1a 32-bit over the text, as 8 hex digits. Deterministic ids need a stable hash, not a secure one. */
export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
