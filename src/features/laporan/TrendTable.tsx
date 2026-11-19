import { formatRupiah } from "@/domain/money";
import { type SalesTrend } from "@/domain/sales";
import { t } from "@/services/i18n";
import { TREND_UNIT_KEY } from "./trendFormat";

interface TrendTableProps {
  trend: SalesTrend;
}

/** Screen-reader copy of the trend chart. */
export function TrendTable({ trend }: TrendTableProps) {
  return (
    <table className="sr-only">
      <caption>{t("laporan.trend.tableCaption", { unit: t(TREND_UNIT_KEY[trend.unit]) })}</caption>
      <thead>
        <tr>
          <th scope="col">{t("laporan.trend.colTime")}</th>
          <th scope="col">{t("laporan.trend.colRevenue")}</th>
          <th scope="col">{t("laporan.trend.colOrders")}</th>
        </tr>
      </thead>
      <tbody>
        {trend.points.map((point) => (
          <tr key={point.key}>
            <th scope="row">{point.label}</th>
            <td>{formatRupiah(point.totalRp)}</td>
            <td>{point.orderCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
