// Promo_Engine: bundle → happy hour → voucher, before tax (Req 30.5, 30.6).
// Lines are processed in canonical key order and promos of one kind in id order,
// so the result does not depend on cart item order. Item discounts are ignored here;
// Tax_Engine caps each line's promo discount at what is left of the line.
// Happy hour acts on units not claimed by a bundle; a voucher acts on the net value left.
import type { Rupiah } from "./money";
import { isHappyHourActive, isWithinValidity } from "./promoTypes";
import type { BundlePromo, HappyHourPromo, Promo, PromoRejection, VoucherPromo } from "./promoTypes";
import { allocateLargestRemainder } from "./splitBill";
import { discountOn, type LineInput, type PromoResult } from "./taxEngine";
import { canonicalLines, validateLines } from "./taxEngineInput";

export type { Promo, PromoScope, PromoRejection } from "./promoTypes";
export { promoRejectionMessage } from "./promoTypes";

interface WorkLine {
  key: string;
  productId: string;
  unitRp: Rupiah;
  /** Units not yet claimed by a bundle. */
  freeQty: number;
  /** Promo discount accumulated so far. */
  discountRp: Rupiah;
  /** Gross value of the line. */
  grossRp: Rupiah;
}
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function toWork(lines: LineInput[]): WorkLine[] {
  return canonicalLines(lines).map((l) => {
    const unitRp = l.unitPriceRp + l.adjustmentsRp;
    return { key: l.key, productId: l.key.split("|")[0], unitRp, freeQty: l.qty, discountRp: 0, grossRp: unitRp * l.qty };
  });
}
// Value of units still eligible for happy hour / voucher.
function eligibleRp(w: WorkLine): Rupiah {
  return Math.max(0, Math.min(w.unitRp * w.freeQty, w.grossRp - w.discountRp));
}
// Net value left on the line, bundle-priced units included (voucher base).
function netRp(w: WorkLine): Rupiah {
  return w.grossRp - w.discountRp;
}
function spread(targets: WorkLine[], totalRp: Rupiah, room: (w: WorkLine) => Rupiah): void {
  const shares = allocateLargestRemainder(totalRp, targets.map(room));
  targets.forEach((w, i) => {
    w.discountRp += Math.min(shares[i], room(w));
  });
}
function applyBundle(work: WorkLine[], promo: BundlePromo): boolean {
  const sets = Math.min(
    ...promo.items.map((it) => {
      const avail = work.filter((w) => w.productId === it.productId).reduce((a, w) => a + w.freeQty, 0);
      return it.qty > 0 ? Math.floor(avail / it.qty) : 0;
    }),
  );
  if (!Number.isFinite(sets) || sets < 1) return false;
  const claimed = new Map<WorkLine, number>();
  for (const it of promo.items) {
    let need = it.qty * sets;
    for (const w of work.filter((x) => x.productId === it.productId)) {
      const take = Math.min(need, w.freeQty);
      if (take > 0) claimed.set(w, (claimed.get(w) ?? 0) + take);
      need -= take;
    }
  }
  const targets = [...claimed.keys()];
  const value = targets.reduce((a, w) => a + w.unitRp * (claimed.get(w) ?? 0), 0);
  const discount = value - promo.fixedPriceRp * sets;
  if (discount <= 0) return false;
  const shares = allocateLargestRemainder(discount, targets.map((w) => w.unitRp * (claimed.get(w) ?? 0)));
  targets.forEach((w, i) => {
    w.discountRp += shares[i];
    w.freeQty -= claimed.get(w) ?? 0;
  });
  return true;
}
function inScope(w: WorkLine, promo: HappyHourPromo): boolean {
  return promo.scope.kind === "all" || promo.scope.productIds.includes(w.productId);
}
function applyDiscountPromo(
  targets: WorkLine[],
  discount: HappyHourPromo["discount"],
  room: (w: WorkLine) => Rupiah = eligibleRp,
): boolean {
  const base = targets.reduce((a, w) => a + room(w), 0);
  const { rp } = discountOn(base, discount);
  if (rp <= 0) return false;
  spread(targets, rp, room);
  return true;
}
function findVoucher(vouchers: VoucherPromo[], code: string): VoucherPromo | undefined {
  const wanted = code.trim().toLowerCase();
  return vouchers.find((v) => v.code.trim().toLowerCase() === wanted);
}
type VoucherOutcome = { applied: string } | { reason: PromoRejection };
function applyVoucher(work: WorkLine[], promos: Promo[], code: string, now: Date, subtotalRp: Rupiah): VoucherOutcome {
  const voucher = findVoucher(promos.filter((p): p is VoucherPromo => p.kind === "voucher").sort(byId), code);
  if (voucher === undefined) return { reason: "voucher_not_found" };
  if (!isWithinValidity(voucher, now)) return { reason: "voucher_expired" };
  if (voucher.maxUses !== null && voucher.usedCount >= voucher.maxUses) return { reason: "voucher_exhausted" };
  if (voucher.minSubtotalRp !== undefined && subtotalRp < voucher.minSubtotalRp) return { reason: "condition_not_met" };
  if (!applyDiscountPromo(work, voucher.discount, netRp)) return { reason: "condition_not_met" };
  return { applied: voucher.id };
}
export function applyPromos(
  lines: LineInput[],
  promos: Promo[],
  voucherCode: string | undefined,
  now: Date,
): PromoResult {
  validateLines(lines, undefined);
  const work = toWork(lines);
  const applied: string[] = [];
  const subtotalRp = work.reduce((a, w) => a + w.grossRp, 0);
  for (const p of promos.filter((x): x is BundlePromo => x.kind === "bundle").sort(byId)) {
    if (applyBundle(work, p)) applied.push(p.id);
  }
  for (const p of promos.filter((x): x is HappyHourPromo => x.kind === "happy_hour").sort(byId)) {
    if (!isHappyHourActive(p, now)) continue;
    if (applyDiscountPromo(work.filter((w) => inScope(w, p)), p.discount)) applied.push(p.id);
  }
  if (voucherCode !== undefined && voucherCode.trim() !== "") {
    const v = applyVoucher(work, promos, voucherCode, now, subtotalRp);
    if ("reason" in v) return { ok: false, reason: v.reason };
    applied.push(v.applied);
  }
  const discountsRp: Record<string, Rupiah> = {};
  for (const w of work) if (w.discountRp > 0) discountsRp[w.key] = w.discountRp;
  return { ok: true, discountsRp, applied };
}
