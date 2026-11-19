// Partial/full refund planning with cumulative proration. Pure.
import type { Rupiah } from "./money";

export interface IngredientQty {
  ingredientId: string;
  qtyMilli: number;
}

export interface OrderLineSnapshot {
  lineId: string;
  /** Quantity sold. */
  qty: number;
  /** Line total after item discount, order discount allocation, tax, and service charge. */
  chargeTotalRp: Rupiah;
  /** Quantity already refunded by earlier refunds. */
  refundedQty: number;
  /** Total consumption of the whole line (all units), from order_item_consumption. */
  consumption: readonly IngredientQty[];
}

export interface OrderSnapshot {
  status: string;
  lines: readonly OrderLineSnapshot[];
}

export interface RefundRequest {
  items: ReadonlyArray<{ lineId: string; qty: number }>;
}

export interface RefundLinePlan {
  lineId: string;
  qty: number;
  amountRp: Rupiah;
}

export type RefundPlan =
  | {
      ok: true;
      amountRp: Rupiah;
      lines: RefundLinePlan[];
      stockReturns: IngredientQty[];
      status: "refunded" | "partially_refunded";
    }
  | { ok: false; maxPerLine: Record<string, number>; reason: string };

/** floor(lineTotal × q / qty), with q clamped to [0, qty]. Exact for large values. */
export function cumulativeShare(lineTotal: number, qty: number, q: number): number {
  if (qty <= 0 || q <= 0) {
    return 0;
  }
  const units = Math.min(q, qty);
  const product = lineTotal * units;
  if (Number.isSafeInteger(product)) {
    return Math.floor(product / qty);
  }
  const big = BigInt(lineTotal) * BigInt(units);
  const quotient = big / BigInt(qty);
  // BigInt division truncates toward zero; adjust to floor for negatives.
  const floored = big % BigInt(qty) !== 0n && big < 0n ? quotient - 1n : quotient;
  return Number(floored);
}

function remainingPerLine(order: OrderSnapshot): Record<string, number> {
  const max: Record<string, number> = {};
  for (const line of order.lines) {
    max[line.lineId] = Math.max(0, line.qty - line.refundedQty);
  }
  return max;
}

function validateRequest(order: OrderSnapshot, req: RefundRequest, max: Record<string, number>): string | null {
  if (order.status !== "completed" && order.status !== "partially_refunded") {
    return `Order berstatus ${order.status} tidak dapat direfund.`;
  }
  if (req.items.length === 0) {
    return "Pilih minimal satu item untuk direfund.";
  }
  const seen = new Set<string>();
  for (const item of req.items) {
    if (!(item.lineId in max) || seen.has(item.lineId)) {
      return `Item ${item.lineId} tidak dikenal atau tercantum lebih dari sekali.`;
    }
    seen.add(item.lineId);
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > max[item.lineId]) {
      return `Jumlah refund item ${item.lineId} harus bilangan bulat 1 sampai ${max[item.lineId]}.`;
    }
  }
  return null;
}

function addReturns(target: Map<string, number>, line: OrderLineSnapshot, k: number): void {
  for (const c of line.consumption) {
    const before = cumulativeShare(c.qtyMilli, line.qty, line.refundedQty);
    const after = cumulativeShare(c.qtyMilli, line.qty, line.refundedQty + k);
    target.set(c.ingredientId, (target.get(c.ingredientId) ?? 0) + after - before);
  }
}

/**
 * Plans a refund: per-line amounts via cumulative proration, stock returns per
 * ingredient with the same formula, and the resulting order status. Rejects
 * the whole request (with per-line maxima) if any item is invalid.
 */
export function planRefund(order: OrderSnapshot, req: RefundRequest): RefundPlan {
  const maxPerLine = remainingPerLine(order);
  const reason = validateRequest(order, req, maxPerLine);
  if (reason !== null) {
    return { ok: false, maxPerLine, reason };
  }
  const byId = new Map(order.lines.map((l) => [l.lineId, l]));
  const returns = new Map<string, number>();
  const lines: RefundLinePlan[] = [];
  let amountRp = 0;
  for (const item of req.items) {
    const line = byId.get(item.lineId);
    if (line === undefined) {
      continue;
    }
    const before = cumulativeShare(line.chargeTotalRp, line.qty, line.refundedQty);
    const after = cumulativeShare(line.chargeTotalRp, line.qty, line.refundedQty + item.qty);
    lines.push({ lineId: line.lineId, qty: item.qty, amountRp: after - before });
    amountRp += after - before;
    addReturns(returns, line, item.qty);
  }
  const requested = new Map(req.items.map((i) => [i.lineId, i.qty]));
  const fullyRefunded = order.lines.every((l) => maxPerLine[l.lineId] - (requested.get(l.lineId) ?? 0) === 0);
  const stockReturns = [...returns.entries()]
    .filter(([, qtyMilli]) => qtyMilli !== 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([ingredientId, qtyMilli]) => ({ ingredientId, qtyMilli }));
  return { ok: true, amountRp, lines, stockReturns, status: fullyRefunded ? "refunded" : "partially_refunded" };
}
