import { Ban, Calculator, ChartColumn, ReceiptText, Tag } from "lucide-react";
import { formatPct } from "@/domain/hppResolve";
import { formatRupiah } from "@/domain/money";
import { type SalesSummary } from "@/domain/sales";
import { t } from "@/services/i18n";
import { StatCard } from "./StatCard";

interface StatGridProps {
  summary: SalesSummary;
}

/** Always five cards; refunds are listed under the void card when present. */
export function StatGrid({ summary }: StatGridProps) {
  const loss = summary.grossProfitRp < 0;
  return (
    <section aria-label={t("laporan.stat.summaryLabel")} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard
        highlight
        label={t("laporan.stat.revenue")}
        icon={ReceiptText}
        value={formatRupiah(summary.grandTotalRp)}
        sub={t("laporan.stat.revenueSub", { average: formatRupiah(summary.averageRp) })}
      />
      <StatCard
        label={t(loss ? "laporan.stat.grossLoss" : "laporan.stat.gross")}
        icon={ChartColumn}
        value={formatRupiah(summary.grossProfitRp)}
        valueClassName={loss ? "text-destructive" : undefined}
        sub={t("laporan.stat.marginSub", { margin: formatPct(summary.profitMarginPct) })}
      />
      <StatCard
        label={t("laporan.stat.cogs")}
        icon={Calculator}
        value={formatRupiah(summary.totalHppRp)}
        sub={t("laporan.stat.cogsSub")}
      />
      <StatCard
        label={t("laporan.stat.discountFees")}
        icon={Tag}
        value={formatRupiah(summary.totalDiscountRp)}
        sub={t("laporan.stat.discountFeesSub", {
          tax: formatRupiah(summary.totalTaxRp),
          service: formatRupiah(summary.totalServiceRp),
        })}
      />
      <StatCard
        className="col-span-2 sm:col-span-1"
        label={t("laporan.stat.void")}
        icon={Ban}
        value={summary.voidedCount}
        sub={
          <>
            <span className="block">
              {t("laporan.stat.voidSub", { amount: formatRupiah(summary.voidedTotalRp) })}
            </span>
            {summary.refundedCount > 0 && (
              <span className="block">
                {t("laporan.stat.refundSub", {
                  count: summary.refundedCount,
                  amount: formatRupiah(summary.refundedTotalRp),
                })}
              </span>
            )}
          </>
        }
      />
    </section>
  );
}
