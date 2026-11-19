import { type Order } from "@/domain/orders";
import { type OrderAction } from "./historyUtils";
import { OrderRow } from "./OrderRow";

interface OrderHistoryListProps {
  groups: Array<[string, Order[]]>;
  expanded: Record<string, boolean>;
  busyId: string | null;
  onToggle: (orderId: string) => void;
  onPrint: (order: Order) => void;
  onAction: (action: OrderAction, order: Order) => void;
}

export function OrderHistoryList({
  groups,
  expanded,
  busyId,
  onToggle,
  onPrint,
  onAction,
}: OrderHistoryListProps) {
  return (
    <div className="grid gap-6">
      {groups.map(([date, list]) => {
        const headingId = `riwayat-date-${list[0]?.id ?? date}`;
        return (
          <section key={date} aria-labelledby={headingId} className="grid gap-2">
            <h2 id={headingId} className="text-sm font-semibold text-muted-foreground">
              {date}
            </h2>
            <ul className="grid gap-2">
              {list.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  expanded={expanded[order.id] === true}
                  busy={busyId === order.id}
                  onToggle={onToggle}
                  onPrint={onPrint}
                  onAction={onAction}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
