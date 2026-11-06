import { formatRupiah } from "../domain/money";
import type { SalesTrend, TrendUnit } from "../domain/sales";
import { Icon } from "./Icon";

export const TREND_UNIT_LABEL: Record<TrendUnit, string> = {
  hour: "per jam",
  day: "per hari",
  week: "per minggu",
  month: "per bulan",
};

/** Ringkas angka rupiah untuk sumbu Y: 1,2 jt / 250 rb. */
export function compactRupiah(value: number): string {
  const abs = Math.abs(value);
  const fmt = (v: number, suffix: string) =>
    `${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })} ${suffix}`;
  if (abs >= 1_000_000_000) return fmt(value / 1_000_000_000, "M");
  if (abs >= 1_000_000) return fmt(value / 1_000_000, "jt");
  if (abs >= 1_000) return fmt(value / 1_000, "rb");
  return value.toLocaleString("id-ID");
}

/** Batas atas yang "bulat" supaya garis bantu enak dibaca. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const norm = value / base;
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const step = steps.find((s) => norm <= s) ?? 10;
  return step * base;
}

export function SalesTrendChart({ trend }: { trend: SalesTrend }) {
  if (trend.points.length === 0 || trend.maxTotalRp === 0) {
    return (
      <div className="trend-empty">
        <Icon name="chart" size={28} />
        <p>Belum ada penjualan di rentang ini.</p>
      </div>
    );
  }

  const max = niceMax(trend.maxTotalRp);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelStep = Math.max(1, Math.ceil(trend.points.length / 10));

  return (
    <div
      className="trend-chart"
      role="img"
      aria-label={`Grafik omzet ${TREND_UNIT_LABEL[trend.unit]}: total ${formatRupiah(trend.totalRp)} dari ${trend.orderCount} transaksi`}
    >
      <div className="trend-y" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ bottom: `${t * 100}%` }}>
            {compactRupiah(max * t)}
          </span>
        ))}
      </div>
      <div className="trend-plot" aria-hidden="true">
        <div className="trend-grid">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${t * 100}%` }} />
          ))}
        </div>
        <div className="trend-bars">
          {trend.points.map((point) => {
            const height = (point.totalRp / max) * 100;
            const isPeak = point.key === trend.peak?.key;
            return (
              <div
                className="trend-slot"
                key={point.key}
                title={`${point.label}: ${formatRupiah(point.totalRp)} · ${point.orderCount} transaksi`}
              >
                <div
                  className={`trend-bar${isPeak ? " is-peak" : ""}${point.totalRp === 0 ? " is-zero" : ""}`}
                  style={{ height: `${height}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="trend-x" aria-hidden="true">
        {trend.points.map((point, i) => (
          <span key={point.key}>{i % labelStep === 0 ? point.label : ""}</span>
        ))}
      </div>
    </div>
  );
}
