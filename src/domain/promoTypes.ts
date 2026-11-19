// Promo definitions and helpers shared by the Promo_Engine.
import type { Rupiah } from "./money";
import type { Discount } from "./taxEngine";

export type PromoScope = { kind: "all" } | { kind: "products"; productIds: string[] };
export interface BundlePromo {
  kind: "bundle";
  id: string;
  items: Array<{ productId: string; qty: number }>;
  fixedPriceRp: Rupiah;
}
export interface HappyHourPromo {
  kind: "happy_hour";
  id: string;
  /** 0 = Sunday … 6 = Saturday (device-local). */
  days: number[];
  /** Minutes since midnight; window is [fromMin, toMin), wraps past midnight when from > to. */
  fromMin: number;
  toMin: number;
  scope: PromoScope;
  discount: Discount;
}
export interface VoucherPromo {
  kind: "voucher";
  id: string;
  code: string;
  /** ISO datetime, or `YYYY-MM-DD` (whole local day, inclusive). */
  validFrom: string;
  validUntil: string;
  maxUses: number | null;
  usedCount: number;
  discount: Discount;
  minSubtotalRp?: Rupiah;
}
export type Promo = BundlePromo | HappyHourPromo | VoucherPromo;
export type PromoRejection = "voucher_not_found" | "voucher_expired" | "voucher_exhausted" | "condition_not_met";

const MESSAGES: Record<PromoRejection, string> = {
  voucher_not_found: "Kode voucher tidak ditemukan.",
  voucher_expired: "Voucher sudah kedaluwarsa atau belum berlaku.",
  voucher_exhausted: "Voucher sudah mencapai batas pemakaian.",
  condition_not_met: "Syarat promo belum terpenuhi.",
};
export function promoRejectionMessage(reason: PromoRejection): string {
  return MESSAGES[reason];
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function parseBoundary(value: string, endOfDay: boolean): number {
  if (!DATE_ONLY.test(value)) return Date.parse(value);
  const [y, m, d] = value.split("-").map(Number);
  return endOfDay ? new Date(y, m - 1, d + 1).getTime() - 1 : new Date(y, m - 1, d).getTime();
}
/** True when `now` lies within [validFrom, validUntil]. Unparseable bounds count as invalid. */
export function isWithinValidity(promo: VoucherPromo, now: Date): boolean {
  const from = parseBoundary(promo.validFrom, false);
  const until = parseBoundary(promo.validUntil, true);
  if (Number.isNaN(from) || Number.isNaN(until)) return false;
  const t = now.getTime();
  return t >= from && t <= until;
}
/** True when a happy hour window covers `now` (device-local day and minute). */
export function isHappyHourActive(promo: HappyHourPromo, now: Date): boolean {
  const min = now.getHours() * 60 + now.getMinutes();
  const wraps = promo.fromMin > promo.toMin;
  const inWindow = wraps ? min >= promo.fromMin || min < promo.toMin : min >= promo.fromMin && min < promo.toMin;
  if (!inWindow) return false;
  const day = wraps && min < promo.toMin ? (now.getDay() + 6) % 7 : now.getDay();
  return promo.days.includes(day);
}
