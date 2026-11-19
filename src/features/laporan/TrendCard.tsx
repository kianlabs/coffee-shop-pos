import { formatRupiah } from "@/domain/money";
import { type SalesTrend } from "@/domain/sales";
import { ReportSection } from "./ReportSection";
import { TrendBars } from "./TrendBars";
import { TREND_UNIT_LABEL } from "./trendFormat";
import { TrendTable } from "./TrendTable";

interface TrendCardProps {
  trend: SalesTrend;
}

export function TrendCard({ trend }: TrendCardProps) {
  const meta = (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm sm:justify-end sm:text-right">
      {trend.peak && (
        <div>
          <dt className="text-xs text-muted-foreground">Puncak · {trend.peak.label}</dt>
          <dd className="font-semibold">{formatRupiah(trend.peak.totalRp)}</dd>
        </div>
      )}
      <div>
        <dt className="text-xs text-muted-foreground">Total</dt>
        <dd className="font-semibold">{formatRupiah(trend.totalRp)}</dd>
      </div>
    </dl>
  );
  return (
    <ReportSection
      id="laporan-tren"
      title="Tren omzet"
      description={`Omzet ${TREND_UNIT_LABEL[trend.unit]} · hanya transaksi selesai.`}
      meta={meta}
    >
      <TrendBars trend={trend} />
      <TrendTable trend={trend} />
    </ReportSection>
  );
}
