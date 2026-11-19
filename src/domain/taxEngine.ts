// Tax_Engine: integer-Rupiah totals. Order of operations: docs/tax-engine.md.
import type { Rupiah } from "./money";
import { allocateDiscount } from "./orders";
import { divRoundHalfUp, roundToMultiple } from "./rounding";
import { allocateLargestRemainder, canonicalLines, validateLines, validateTaxConfig } from "./taxEngineInput";
export interface LineInput {
  /** Stable key: productId|variantId|sorted modifierIds. Unique per cart. */
  key: string;
  unitPriceRp: Rupiah;
  /** Sum of modifier price adjustments (may be negative). */
  adjustmentsRp: Rupiah;
  qty: number;
  discount?: Discount;
}
/** Amount 0..999.999.999 Rp, or percent in basis points 0..10.000. */
export type Discount = { kind: "amount"; rp: Rupiah } | { kind: "percent"; bp: number };
export type PromoResult =
  | { ok: true; discountsRp: Record<string, Rupiah>; applied: string[] }
  | {
      ok: false;
      reason: "voucher_not_found" | "voucher_expired" | "voucher_exhausted" | "condition_not_met";
    };
export interface TaxConfig {
  taxMode: "off" | "exclusive" | "inclusive";
  taxRateBp: number;
  taxBase: "after_discount" | "after_discount_plus_service";
  serviceEnabled: boolean;
  serviceRateBp: number;
  /** 0 = rounding off. */
  roundingStep: 0 | 100 | 500 | 1000;
}
export interface TotalsLine {
  key: string;
  grossRp: Rupiah;
  netRp: Rupiah;
  chargeTotalRp: Rupiah;
}
export interface Totals {
  subtotalRp: Rupiah;
  itemDiscountRp: Rupiah;
  promoDiscountRp: Rupiah;
  orderDiscountRp: Rupiah;
  /** item + promo + order discounts. */
  discountRp: Rupiah;
  serviceChargeRp: Rupiah;
  taxExclusiveRp: Rupiah;
  /** Informational only (inclusive mode); never added to the total. */
  taxInclusiveComponentRp: Rupiah;
  roundingRp: Rupiah;
  totalRp: Rupiah;
  /** Canonical order (sorted by key). */
  lines: TotalsLine[];
  clamped: { item: boolean; order: boolean };
}
export const NO_PROMO: PromoResult = { ok: true, discountsRp: {}, applied: [] };
const BP_DENOM = 10_000;
/** Discount value on `base`, capped at `base`. */
export function discountOn(base: Rupiah, discount: Discount | undefined): { rp: Rupiah; clamped: boolean } {
  if (discount === undefined) return { rp: 0, clamped: false };
  const raw = discount.kind === "percent" ? divRoundHalfUp(base * discount.bp, BP_DENOM) : discount.rp;
  return raw > base ? { rp: base, clamped: true } : { rp: raw, clamped: false };
}
function promoFor(promo: PromoResult, key: string): Rupiah {
  if (!promo.ok) return 0;
  const rp = Object.hasOwn(promo.discountsRp, key) ? promo.discountsRp[key] : 0;
  if (!Number.isSafeInteger(rp) || rp < 0) {
    throw new RangeError(`Diskon promo untuk baris ${key} harus bilangan bulat ≥ 0.`);
  }
  return rp;
}
function taxParts(base: Rupiah, service: Rupiah, cfg: TaxConfig): { exclusive: Rupiah; inclusive: Rupiah } {
  if (cfg.taxMode === "off") return { exclusive: 0, inclusive: 0 };
  const taxable = cfg.taxBase === "after_discount_plus_service" ? base + service : base;
  if (cfg.taxMode === "exclusive") {
    return { exclusive: divRoundHalfUp(taxable * cfg.taxRateBp, BP_DENOM), inclusive: 0 };
  }
  const netOfTax = divRoundHalfUp(taxable * BP_DENOM, BP_DENOM + cfg.taxRateBp);
  return { exclusive: 0, inclusive: taxable - netOfTax };
}
interface LineDiscounts {
  gross: Rupiah[];
  item: Rupiah[];
  promo: Rupiah[];
  order: Rupiah[];
  clamped: { item: boolean; order: boolean };
}
// Steps 2–5: gross, item discount, promo discount, order discount allocation.
function applyDiscounts(lines: LineInput[], orderDiscount: Discount | undefined, promo: PromoResult): LineDiscounts {
  const gross = lines.map((l) => (l.unitPriceRp + l.adjustmentsRp) * l.qty);
  const itemResults = lines.map((l, i) => discountOn(gross[i], l.discount));
  const item = itemResults.map((r) => r.rp);
  const promoRp = lines.map((l, i) => Math.min(promoFor(promo, l.key), gross[i] - item[i]));
  const afterPromo = gross.map((g, i) => g - item[i] - promoRp[i]);
  const orderResult = discountOn(sum(afterPromo), orderDiscount);
  const order = allocateDiscount(afterPromo, orderResult.rp);
  const clamped = { item: itemResults.some((r) => r.clamped), order: orderResult.clamped };
  return { gross, item, promo: promoRp, order, clamped };
}
function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
export function computeTotals(
  lines: LineInput[],
  orderDiscount: Discount | undefined,
  promoDiscountsRp: PromoResult,
  cfg: TaxConfig,
): Totals {
  validateTaxConfig(cfg);
  validateLines(lines, orderDiscount);
  const sorted = canonicalLines(lines);
  const d = applyDiscounts(sorted, orderDiscount, promoDiscountsRp);
  const net = d.gross.map((g, i) => g - d.item[i] - d.promo[i] - d.order[i]);
  const base = sum(net);
  const service = cfg.serviceEnabled ? divRoundHalfUp(base * cfg.serviceRateBp, BP_DENOM) : 0;
  const tax = taxParts(base, service, cfg);
  const pre = base + service + tax.exclusive;
  const roundingRp = cfg.roundingStep === 0 ? 0 : roundToMultiple(pre, cfg.roundingStep).roundingRp;
  const totalRp = pre + roundingRp;
  const charges = allocateLargestRemainder(totalRp, net);
  const itemDiscountRp = sum(d.item);
  const promoDiscountRp = sum(d.promo);
  const orderDiscountRp = sum(d.order);
  return {
    subtotalRp: sum(d.gross),
    itemDiscountRp,
    promoDiscountRp,
    orderDiscountRp,
    discountRp: itemDiscountRp + promoDiscountRp + orderDiscountRp,
    serviceChargeRp: service,
    taxExclusiveRp: tax.exclusive,
    taxInclusiveComponentRp: tax.inclusive,
    roundingRp,
    totalRp,
    lines: sorted.map((l, i) => ({ key: l.key, grossRp: d.gross[i], netRp: net[i], chargeTotalRp: charges[i] })),
    clamped: d.clamped,
  };
}
