import { formatRupiah } from "@/domain/money";
import { type SalesTrend } from "@/domain/sales";
import { t } from "@/services/i18n";
import { ReportSection } from "./ReportSection";
import { TrendBars } from "./TrendBars";
import { TREND_UNIT_KEY } from "./trendFormat";
import { TrendTable } from "./TrendTable";

interface TrendCardProps {
  trend: SalesTrend;
}

export function TrendCard({ trend }: TrendCardProps) {
  const meta = (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm sm:justify-end sm:text-right">
      {trend.peak && (
        <div>
          <dt className="text-xs text-muted-foreground">{t("laporan.trend.peak", { label: trend.peak.label })}</dt>
          <dd className="font-semibold">{formatRupiah(trend.peak.totalRp)}</dd>
        </div>
      )}
      <div>
        <dt className="text-xs text-muted-foreground">{t("laporan.trend.total")}</dt>
        <dd className="font-semibold">{formatRupiah(trend.totalRp)}</dd>
      </div>
    </dl>
  );
  return (
    <ReportSection
      id="laporan-tren"
      title={t("laporan.trend.title")}
      description={t("laporan.trend.description", { unit: t(TREND_UNIT_KEY[trend.unit]) })}
      meta={meta}
    >
      <TrendBars trend={trend} />
      <TrendTable trend={trend} />
    </ReportSection>
  );
}
