// Payment validation and quick cash amounts. Rules: docs/tax-engine.md.
import { formatRupiah, type Rupiah } from "./money";
import { PAYMENT_METHODS, type PaymentMethodId } from "./settings/paymentMethods";
export { PAYMENT_METHODS, type PaymentMethodId };
export const PAYMENT_MIN_RP = 1;
export const PAYMENT_MAX_RP = 999_999_999;
export const MAX_PER_ORDER_RANGE = { min: 1, max: 20 } as const;
export interface PaymentEntry {
  method: PaymentMethodId;
  amountRp: Rupiah;
}
export interface PaymentConfig {
  /** Setting `pembayaran.maks_per_order` (1–20). */
  maxPerOrder: number;
}
export type PaymentErrorCode =
  | "invalid_amount"
  | "invalid_method"
  | "too_many"
  | "non_cash_exceeds"
  | "already_paid"
  | "insufficient";
export type PaymentValidation =
  | { ok: true; paidRp: Rupiah; changeRp: Rupiah }
  | {
      ok: false;
      code: PaymentErrorCode;
      message: string;
      /** Offending payment index, or null for list-level errors. */
      index: number | null;
      /** Remaining bill before the offending payment (or after all, for `insufficient`). */
      remainingRp: Rupiah;
    };
const KNOWN_METHODS: readonly string[] = PAYMENT_METHODS;
export function isValidPaymentAmount(amountRp: number): boolean {
  return Number.isInteger(amountRp) && amountRp >= PAYMENT_MIN_RP && amountRp <= PAYMENT_MAX_RP;
}
function assertInputs(totalRp: Rupiah, cfg: PaymentConfig): void {
  if (!Number.isSafeInteger(totalRp) || totalRp < 0) {
    throw new RangeError("Total order harus bilangan bulat Rupiah ≥ 0.");
  }
  const { min, max } = MAX_PER_ORDER_RANGE;
  if (!Number.isInteger(cfg.maxPerOrder) || cfg.maxPerOrder < min || cfg.maxPerOrder > max) {
    throw new RangeError("Batas pembayaran per order harus 1–20.");
  }
}
function fail(code: PaymentErrorCode, message: string, index: number | null, remainingRp: Rupiah): PaymentValidation {
  return { ok: false, code, message, index, remainingRp };
}
function entryError(p: PaymentEntry, index: number, remaining: Rupiah): PaymentValidation | null {
  if (!isValidPaymentAmount(p.amountRp)) {
    return fail("invalid_amount", "Nominal harus bilangan bulat 1–999.999.999 Rupiah.", index, remaining);
  }
  if (!KNOWN_METHODS.includes(p.method)) {
    return fail("invalid_method", `Metode bayar tidak dikenal: ${p.method}.`, index, remaining);
  }
  if (remaining === 0) {
    return fail("already_paid", "Tagihan sudah lunas; pembayaran tambahan tidak diperlukan.", index, remaining);
  }
  if (p.method !== "cash" && p.amountRp > remaining) {
    return fail("non_cash_exceeds", "Pembayaran non-tunai tidak boleh melebihi sisa tagihan.", index, remaining);
  }
  return null;
}
/**
 * Validate payments in entry order. Change only comes from a cash payment
 * that exceeds the remaining bill; any payment after the bill is settled is rejected.
 */
export function validatePayments(
  totalRp: Rupiah,
  payments: PaymentEntry[],
  cfg: PaymentConfig,
): PaymentValidation {
  assertInputs(totalRp, cfg);
  if (payments.length > cfg.maxPerOrder) {
    const message = `Satu order maksimal memiliki ${cfg.maxPerOrder} pembayaran.`;
    return fail("too_many", message, null, totalRp);
  }
  let remaining = totalRp;
  let paidRp = 0;
  let changeRp = 0;
  for (const [index, p] of payments.entries()) {
    const error = entryError(p, index, remaining);
    if (error !== null) return error;
    paidRp += p.amountRp;
    changeRp += Math.max(0, p.amountRp - remaining);
    remaining = Math.max(0, remaining - p.amountRp);
  }
  if (remaining > 0) {
    return fail("insufficient", `Pembayaran kurang ${formatRupiah(remaining)}.`, null, remaining);
  }
  return { ok: true, paidRp, changeRp };
}
const CASH_STEPS = [5_000, 10_000, 50_000, 100_000] as const;
const MAX_SUGGESTIONS = 5;
/**
 * Quick cash buttons: exact amount first, then the next multiples of
 * 5.000 / 10.000 / 50.000 / 100.000 above the total (distinct, ascending).
 */
export function suggestCashAmounts(totalRp: Rupiah): Rupiah[] {
  if (!Number.isSafeInteger(totalRp) || totalRp <= 0 || totalRp > PAYMENT_MAX_RP) return [];
  const amounts = new Set<Rupiah>([totalRp]);
  for (const step of CASH_STEPS) {
    const next = (Math.floor(totalRp / step) + 1) * step;
    if (next <= PAYMENT_MAX_RP) amounts.add(next);
  }
  return [...amounts].sort((a, b) => a - b).slice(0, MAX_SUGGESTIONS);
}
