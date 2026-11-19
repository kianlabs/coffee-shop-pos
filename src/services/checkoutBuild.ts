import type { Rupiah } from "@/domain/money";
import type { Movement } from "@/domain/stockLedger";
import type { LineInput, PromoResult, Totals } from "@/domain/taxEngine";
import { NO_PROMO } from "@/domain/taxEngine";
import type { CheckoutCommand, CheckoutLineInput } from "./checkoutTypes";
import type { Ids } from "./ports";
import type { OrderLineRecord, OrderRecord, PaymentRecord, StockMovementRecord } from "./ports/orders";

const PROMO_MESSAGES: Record<string, string> = {
  voucher_not_found: "Voucher tidak ditemukan.",
  voucher_expired: "Voucher sudah kedaluwarsa.",
  voucher_exhausted: "Voucher sudah habis dipakai.",
  condition_not_met: "Syarat voucher belum terpenuhi.",
};

export function promoMessage(reason: string): string {
  return PROMO_MESSAGES[reason] ?? "Promo tidak dapat dipakai.";
}

/** Sums the discounts of several promo results; the first failure wins. */
export function mergePromos(results: PromoResult[]): PromoResult {
  const discountsRp: Record<string, Rupiah> = {};
  const applied: string[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    applied.push(...r.applied);
    for (const [key, rp] of Object.entries(r.discountsRp)) discountsRp[key] = (discountsRp[key] ?? 0) + rp;
  }
  return results.length === 0 ? NO_PROMO : { ok: true, discountsRp, applied };
}

export function toLineInputs(lines: CheckoutLineInput[]): LineInput[] {
  return lines.map((l) => ({
    key: l.key,
    unitPriceRp: l.unitPriceRp,
    adjustmentsRp: l.adjustmentsRp,
    qty: l.qty,
    ...(l.discount === undefined ? {} : { discount: l.discount }),
  }));
}

function buildLine(input: CheckoutLineInput, chargeTotalRp: Rupiah, lineId: string): OrderLineRecord {
  return {
    lineId,
    key: input.key,
    productId: input.productId,
    name: input.name,
    qty: input.qty,
    unitPriceRp: input.unitPriceRp,
    adjustmentsRp: input.adjustmentsRp,
    chargeTotalRp,
    hppRp: input.hppRp,
    modifiers: input.modifiers.map((m) => ({ ...m })),
    consumption: input.consumptionPerUnit.map((c) => ({ ingredientId: c.ingredientId, qtyMilli: c.qtyMilli * input.qty })),
    refundedQty: 0,
  };
}

export function buildOrder(cmd: CheckoutCommand, totals: Totals, changeRp: Rupiah, ids: Ids, now: Date): OrderRecord {
  const charge = new Map(totals.lines.map((l) => [l.key, l.chargeTotalRp]));
  return {
    id: ids.next(),
    idempotencyKey: cmd.idempotencyKey,
    status: "completed",
    userId: cmd.userId,
    createdAt: now.toISOString(),
    subtotalRp: totals.subtotalRp,
    discountRp: totals.discountRp,
    serviceChargeRp: totals.serviceChargeRp,
    taxRp: totals.taxExclusiveRp + totals.taxInclusiveComponentRp,
    roundingRp: totals.roundingRp,
    totalRp: totals.totalRp,
    changeRp,
    lines: cmd.lines.map((l) => buildLine(l, charge.get(l.key) ?? 0, ids.next())),
  };
}

export function buildPayments(cmd: CheckoutCommand, orderId: string, ids: Ids): PaymentRecord[] {
  return cmd.payments.map((p) => ({
    id: ids.next(),
    orderId,
    method: p.method,
    amountRp: p.amountRp,
    status: "paid",
    reference: p.reference ?? null,
  }));
}

/** One sale_consumption movement per ingredient, sorted by id. */
export function saleMovements(order: OrderRecord, ids: Ids): StockMovementRecord[] {
  const totals = new Map<string, number>();
  for (const line of order.lines) {
    for (const c of line.consumption) totals.set(c.ingredientId, (totals.get(c.ingredientId) ?? 0) + c.qtyMilli);
  }
  const movements: Array<Movement & { ingredientId: string }> = [...totals]
    .filter(([, qtyMilli]) => qtyMilli > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([ingredientId, qtyMilli]) => ({ ingredientId, type: "sale_consumption", qtyMilli }));
  return movements.map((m) => ({
    id: ids.next(),
    ingredientId: m.ingredientId,
    type: m.type,
    qtyMilli: m.qtyMilli,
    referenceType: "order",
    referenceId: order.id,
    createdAt: order.createdAt,
  }));
}
