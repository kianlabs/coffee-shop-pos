import { CalendarDays, ReceiptText } from "lucide-react";
import { useMemo } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { type Order } from "@/domain/orders";
import { formatRangeLabel, paymentBreakdown, salesTrend, summarizeSales, topProducts } from "@/domain/sales";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";
import { PaymentMixCard } from "./PaymentMixCard";
import { PeriodSelector } from "./PeriodSelector";
import { StatGrid } from "./StatGrid";
import { TopProductsCard } from "./TopProductsCard";
import { TrendCard } from "./TrendCard";
import { useReportRange } from "./useReportRange";

interface SalesReportProps {
  orders: Order[];
}

export function SalesReport({ orders }: SalesReportProps) {
  const range = useReportRange();
  const setView = useAppStore((s) => s.setView);
  const { start, end } = range;
  const summary = useMemo(() => summarizeSales(orders, start, end), [orders, start, end]);
  const top = useMemo(() => topProducts(orders, start, end, 10), [orders, start, end]);
  const pay = useMemo(() => paymentBreakdown(orders, start, end), [orders, start, end]);
  const trend = useMemo(() => salesTrend(orders, start, end), [orders, start, end]);
  const rangeLabel = formatRangeLabel(start, end);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PeriodSelector range={range} />
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground" aria-live="polite">
        <CalendarDays className="size-4" aria-hidden />
        <span>{rangeLabel}</span>
        <span aria-hidden>·</span>
        <strong className="font-semibold text-foreground">
          {t("laporan.summary.orders", { count: summary.orderCount })}
        </strong>
      </p>
      <StatGrid summary={summary} />
      <TrendCard trend={trend} />
      {summary.orderCount === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={t("laporan.empty.title")}
          description={t("laporan.empty.description", { range: rangeLabel })}
          action={
            <Button variant="outline" onClick={() => setView("kasir")}>
              {t("laporan.empty.openCashier")}
            </Button>
          }
        />
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <TopProductsCard products={top} />
          <PaymentMixCard items={pay} />
        </div>
      )}
    </div>
  );
}
