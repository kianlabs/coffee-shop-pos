// Input validation, canonical ordering and allocation for the Tax_Engine.
import type { Discount, LineInput, TaxConfig } from "./taxEngine";
export const BP_MAX = 10_000;
export const DISCOUNT_MAX_RP = 999_999_999;
const TAX_MODES: readonly string[] = ["off", "exclusive", "inclusive"];
const TAX_BASES: readonly string[] = ["after_discount", "after_discount_plus_service"];
const ROUNDING_STEPS: readonly number[] = [0, 100, 500, 1000];
function isBp(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= BP_MAX;
}
export function validateTaxConfig(cfg: TaxConfig): void {
  if (!TAX_MODES.includes(cfg.taxMode)) throw new RangeError(`Mode pajak tidak dikenal: ${cfg.taxMode}.`);
  if (!TAX_BASES.includes(cfg.taxBase)) throw new RangeError(`Dasar pajak tidak dikenal: ${cfg.taxBase}.`);
  if (!isBp(cfg.taxRateBp)) throw new RangeError("Tarif pajak harus bilangan bulat 0–10.000 basis poin.");
  if (!isBp(cfg.serviceRateBp)) {
    throw new RangeError("Tarif biaya layanan harus bilangan bulat 0–10.000 basis poin.");
  }
  if (!ROUNDING_STEPS.includes(cfg.roundingStep)) {
    throw new RangeError("Kelipatan pembulatan harus 0, 100, 500, atau 1.000 Rupiah.");
  }
}
/** Indonesian error message, or null when the discount is valid. */
export function discountError(discount: Discount): string | null {
  if (discount.kind === "percent") {
    return isBp(discount.bp) ? null : "Diskon persen harus 0–100% (0–10.000 basis poin).";
  }
  const ok = Number.isInteger(discount.rp) && discount.rp >= 0 && discount.rp <= DISCOUNT_MAX_RP;
  return ok ? null : "Diskon nominal harus bilangan bulat 0–999.999.999 Rupiah.";
}
function lineError(line: LineInput): string | null {
  if (!Number.isSafeInteger(line.unitPriceRp) || line.unitPriceRp < 0) {
    return `Harga satuan baris ${line.key} harus bilangan bulat ≥ 0.`;
  }
  if (!Number.isSafeInteger(line.adjustmentsRp) || line.unitPriceRp + line.adjustmentsRp < 0) {
    return `Selisih harga modifier baris ${line.key} tidak valid.`;
  }
  if (!Number.isSafeInteger(line.qty) || line.qty < 1) {
    return `Jumlah baris ${line.key} harus bilangan bulat ≥ 1.`;
  }
  if (!Number.isSafeInteger((line.unitPriceRp + line.adjustmentsRp) * line.qty)) {
    return `Nilai baris ${line.key} melewati batas aman.`;
  }
  return line.discount === undefined ? null : discountError(line.discount);
}
/** Throws RangeError on the first invalid line, duplicate key or discount. */
export function validateLines(lines: LineInput[], orderDiscount: Discount | undefined): void {
  const keys = new Set<string>();
  let subtotal = 0;
  for (const line of lines) {
    const error = lineError(line);
    if (error !== null) throw new RangeError(error);
    if (keys.has(line.key)) throw new RangeError(`Kunci baris ganda: ${line.key}.`);
    keys.add(line.key);
    subtotal += (line.unitPriceRp + line.adjustmentsRp) * line.qty;
  }
  if (!Number.isSafeInteger(subtotal)) throw new RangeError("Subtotal melewati batas aman.");
  const orderError = orderDiscount === undefined ? null : discountError(orderDiscount);
  if (orderError !== null) throw new RangeError(orderError);
}
/** Lines sorted by key (code-unit order, locale independent). */
export function canonicalLines(lines: LineInput[]): LineInput[] {
  return [...lines].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
/**
 * Split `total` proportionally to non-negative `weights` with the largest
 * remainder method; ties go to the lower index. Σ result = total.
 * Uses BigInt so total × weight cannot overflow.
 */
export function allocateLargestRemainder(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || weightSum === 0) return weights.map(() => 0);
  const t = BigInt(total);
  const s = BigInt(weightSum);
  const parts = weights.map((w, idx) => {
    const product = t * BigInt(w);
    return { idx, share: Number(product / s), rem: product % s };
  });
  let left = total - parts.reduce((a, p) => a + p.share, 0);
  const byRemainder = [...parts].sort((a, b) => (a.rem === b.rem ? a.idx - b.idx : a.rem > b.rem ? -1 : 1));
  for (const part of byRemainder) {
    if (left === 0) break;
    part.share += 1;
    left -= 1;
  }
  return parts.map((p) => p.share);
}
