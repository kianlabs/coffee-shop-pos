import { paymentLabel } from "@/data/receipt";
import { type PaymentMethod } from "@/domain/orders";
import { type PaymentBreakdownItem } from "@/domain/sales";

const METHOD_COLOR: Record<PaymentMethod, string> = {
  cash: "bg-success",
  qris_manual: "bg-info",
  other: "bg-warning",
};

function isPaymentMethod(value: string): value is PaymentMethod {
  return value in METHOD_COLOR;
}

export interface PaymentShare extends PaymentBreakdownItem {
  label: string;
  colorClass: string;
  /** Percent of the period's completed total, 0–100. */
  sharePct: number;
}

export function paymentShares(items: PaymentBreakdownItem[]): PaymentShare[] {
  const total = items.reduce((sum, p) => sum + p.totalRp, 0);
  return items.map((p) => ({
    ...p,
    label: isPaymentMethod(p.method) ? paymentLabel(p.method) : "Lainnya",
    colorClass: isPaymentMethod(p.method) ? METHOD_COLOR[p.method] : "bg-muted-foreground",
    sharePct: total > 0 ? (p.totalRp / total) * 100 : 0,
  }));
}
