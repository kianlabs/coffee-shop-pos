import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";
import { filterOrders, groupByDate, type ActionRequest, type HistoryFilter } from "./historyUtils";
import { HistoryBody } from "./HistoryBody";
import { HistoryToolbar } from "./HistoryToolbar";
import { OrderHistoryList } from "./OrderHistoryList";
import { PinDialog } from "./PinDialog";
import { useOrderActions } from "./useOrderActions";

function confirmCopy(req: ActionRequest | null) {
  if (req?.action === "refund") {
    return {
      title: t("riwayat.confirm.refundTitle"),
      description: t("riwayat.confirm.refundDescription", { label: req.label }),
      confirmLabel: t("riwayat.action.refund"),
    };
  }
  return {
    title: t("riwayat.confirm.voidTitle"),
    description: t("riwayat.confirm.voidDescription", { label: req?.label ?? "" }),
    confirmLabel: t("riwayat.action.void"),
  };
}

export function RiwayatScreen() {
  const orders = useAppStore((s) => s.orders);
  const dbReady = useAppStore((s) => s.dbReady);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const deferredQuery = useDeferredValue(query);
  const actions = useOrderActions();

  const groups = useMemo(
    () => groupByDate(filterOrders(orders, filter, deferredQuery)),
    [orders, filter, deferredQuery],
  );
  const toggle = useCallback((orderId: string) => {
    setExpanded((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  }, []);
  const copy = confirmCopy(actions.confirmRequest);

  return (
    <div className="grid gap-4">
      <HistoryToolbar
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        reloading={actions.reloading}
        onReload={() => void actions.reload()}
      />
      <HistoryBody
        dbReady={dbReady}
        hasOrders={orders.length > 0}
        list={
          <OrderHistoryList
            groups={groups}
            expanded={expanded}
            busyId={actions.busyId}
            onToggle={toggle}
            onPrint={(order) => void actions.print(order)}
            onAction={actions.start}
          />
        }
        isEmpty={groups.length === 0}
      />
      <PinDialog pin={actions.pin} />
      <ConfirmDialog
        open={actions.confirmRequest !== null}
        onOpenChange={(open) => {
          if (!open) actions.closeConfirm();
        }}
        title={copy.title}
        description={copy.description}
        confirmLabel={copy.confirmLabel}
        destructive
        onConfirm={() => void actions.confirm()}
      />
    </div>
  );
}
