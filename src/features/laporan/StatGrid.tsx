import { Ban, Calculator, ChartColumn, ReceiptText, Tag } from "lucide-react";
import { formatPct } from "@/domain/hppResolve";
import { formatRupiah } from "@/domain/money";
import { type SalesSummary } from "@/domain/sales";
import { StatCard } from "./StatCard";

interface StatGridProps {
  summary: SalesSummary;
}

/** Always five cards; refunds are listed under the void card when present. */
export function StatGrid({ summary }: StatGridProps) {
  const loss = summary.grossProfitRp < 0;
  return (
    <section aria-label="Ringkasan" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard
        highlight
        label="Omzet"
        icon={ReceiptText}
        value={formatRupiah(summary.grandTotalRp)}
        sub={`rata-rata ${formatRupiah(summary.averageRp)} / transaksi`}
      />
      <StatCard
        label={loss ? "Laba kotor (rugi)" : "Laba kotor"}
        icon={ChartColumn}
        value={formatRupiah(summary.grossProfitRp)}
        valueClassName={loss ? "text-destructive" : undefined}
        sub={`margin ${formatPct(summary.profitMarginPct)} dari omzet`}
      />
      <StatCard
        label="HPP terjual"
        icon={Calculator}
        value={formatRupiah(summary.totalHppRp)}
        sub="dari snapshot saat transaksi"
      />
      <StatCard
        label="Diskon & biaya"
        icon={Tag}
        value={formatRupiah(summary.totalDiscountRp)}
        sub={`pajak ${formatRupiah(summary.totalTaxRp)} · layanan ${formatRupiah(summary.totalServiceRp)}`}
      />
      <StatCard
        className="col-span-2 sm:col-span-1"
        label="Transaksi void"
        icon={Ban}
        value={summary.voidedCount}
        sub={
          <>
            <span className="block">{formatRupiah(summary.voidedTotalRp)} dibatalkan</span>
            {summary.refundedCount > 0 && (
              <span className="block">
                {summary.refundedCount} refund · {formatRupiah(summary.refundedTotalRp)} dikembalikan
              </span>
            )}
          </>
        }
      />
    </section>
  );
}
