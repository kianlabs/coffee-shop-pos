import { formatRupiah } from "@/domain/money";
import { type SalesTrend } from "@/domain/sales";
import { TREND_UNIT_LABEL } from "./trendFormat";

interface TrendTableProps {
  trend: SalesTrend;
}

/** Screen-reader copy of the trend chart. */
export function TrendTable({ trend }: TrendTableProps) {
  return (
    <table className="sr-only">
      <caption>Data omzet {TREND_UNIT_LABEL[trend.unit]}</caption>
      <thead>
        <tr>
          <th scope="col">Waktu</th>
          <th scope="col">Omzet</th>
          <th scope="col">Transaksi</th>
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
