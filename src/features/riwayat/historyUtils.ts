import { type Order } from "@/domain/orders";
import { t } from "@/services/i18n";

export type HistoryFilter = "all" | Order["status"];
export type OrderAction = "void" | "refund";

/** One void/refund the user started; `label` is the receipt number shown in copy. */
export interface ActionRequest {
  action: OrderAction;
  orderId: string;
  label: string;
}

/** Filter value and the message key for its label. */
export const HISTORY_FILTERS: ReadonlyArray<readonly [HistoryFilter, string]> = [
  ["all", "riwayat.filter.all"],
  ["completed", "riwayat.status.completed"],
  ["voided", "riwayat.status.voided"],
  ["refunded", "riwayat.status.refunded"],
];

export function filterOrders(orders: Order[], filter: HistoryFilter, rawQuery: string): Order[] {
  const query = rawQuery.trim().toLowerCase();
  return orders.filter((order) => {
    if (filter !== "all" && order.status !== filter) return false;
    if (!query) return true;
    return (
      order.receiptNumber.toLowerCase().includes(query) ||
      order.lines.some((line) => line.productName.toLowerCase().includes(query))
    );
  });
}

/** Groups by local calendar date, keeping the incoming (newest-first) order. */
export function groupByDate(orders: Order[]): Array<[string, Order[]]> {
  const map = new Map<string, Order[]>();
  for (const order of orders) {
    const key = new Date(order.createdAt).toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const list = map.get(key);
    if (list) list.push(order);
    else map.set(key, [order]);
  }
  return [...map.entries()];
}

export function orderItemCount(order: Order): number {
  return order.lines.reduce((sum, line) => sum + line.qty, 0);
}

export function orderTime(order: Order): string {
  return new Date(order.createdAt).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusLabel(status: Order["status"]): string {
  if (status === "voided") return t("riwayat.status.voided");
  if (status === "refunded") return t("riwayat.status.refunded");
  return t("riwayat.status.completed");
}

export function actionLabel(action: OrderAction): string {
  return action === "refund" ? t("riwayat.action.refund") : t("riwayat.action.void");
}
