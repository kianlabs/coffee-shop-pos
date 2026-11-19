import { ChevronDown, ChevronRight, Printer, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { paymentLabel } from "@/data/receipt";
import { formatRupiah } from "@/domain/money";
import { type Order } from "@/domain/orders";
import { t } from "@/services/i18n";
import { orderItemCount, orderTime, type OrderAction } from "./historyUtils";
import { OrderDetail } from "./OrderDetail";
import { OrderStatusBadge } from "./OrderStatusBadge";

interface OrderRowProps {
  order: Order;
  expanded: boolean;
  busy: boolean;
  onToggle: (orderId: string) => void;
  onPrint: (order: Order) => void;
  onAction: (action: OrderAction, order: Order) => void;
}

export function OrderRow({ order, expanded, busy, onToggle, onPrint, onAction }: OrderRowProps) {
  const detailId = `order-detail-${order.id}`;
  return (
    <li data-testid="order-row" className="grid gap-3 rounded-lg border bg-card p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold break-all">{order.receiptNumber}</span>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {t("riwayat.row.meta", {
              time: orderTime(order),
              payment: paymentLabel(order.payment.method),
              count: orderItemCount(order),
              change: formatRupiah(order.changeRp),
            })}
          </p>
        </div>
        <div className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0">
          <span className="text-lg font-semibold">{formatRupiah(order.totalRp)}</span>
          <span className="text-xs text-muted-foreground">
            {t("riwayat.row.lines", { count: order.lines.length })}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          aria-expanded={expanded}
          aria-controls={expanded ? detailId : undefined}
          onClick={() => onToggle(order.id)}
        >
          {expanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
          {expanded ? t("riwayat.row.hide") : t("riwayat.row.detail")}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => onPrint(order)}>
          <Printer aria-hidden />
          {t("riwayat.row.print")}
        </Button>
        {order.status === "completed" && (
          <>
            <Button
              variant="outline"
              disabled={busy}
              className="text-warning"
              onClick={() => onAction("refund", order)}
            >
              <Undo2 aria-hidden />
              {t("riwayat.action.refund")}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              className="text-destructive"
              onClick={() => onAction("void", order)}
            >
              <XCircle aria-hidden />
              {t("riwayat.action.void")}
            </Button>
          </>
        )}
      </div>
      {expanded && <OrderDetail order={order} id={detailId} />}
    </li>
  );
}
