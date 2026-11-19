import { formatRupiah } from "@/domain/money";
import { type SalesTrend } from "@/domain/sales";
import { cn } from "cn";
import { compactRupiah, niceMax, TREND_UNIT_LABEL } from "./trendFormat";

const TICKS = [0, 0.25, 0.5, 0.75, 1];

interface TrendBarsProps {
  trend: SalesTrend;
}

/** Visual bar chart. Screen readers get the summary label plus TrendTable. */
export function TrendBars({ trend }: TrendBarsProps) {
  const max = niceMax(trend.maxTotalRp);
  const n = trend.points.length;
  const phoneStep = Math.max(1, Math.ceil(n / 6));
  const wideStep = Math.max(1, Math.ceil(n / 12));
  const empty = trend.maxTotalRp === 0;
  return (
    <div
      data-testid="trend-chart"
      role="img"
      aria-label={`Grafik omzet ${TREND_UNIT_LABEL[trend.unit]}: total ${formatRupiah(trend.totalRp)} dari ${trend.orderCount} transaksi`}
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2"
    >
      <div className="relative h-48 w-11 text-[10px] text-muted-foreground sm:h-56" aria-hidden>
        {TICKS.map((t) => (
          <span key={t} className="absolute right-0 translate-y-1/2 whitespace-nowrap" style={{ bottom: `${t * 100}%` }}>
            {empty ? "" : compactRupiah(max * t)}
          </span>
        ))}
      </div>
      <div className="relative h-48 sm:h-56">
        {TICKS.map((t) => (
          <span key={t} aria-hidden className="absolute inset-x-0 border-t border-dashed" style={{ bottom: `${t * 100}%` }} />
        ))}
        <div className="absolute inset-0 flex items-end gap-px sm:gap-1">
          {trend.points.map((point) => (
            <div key={point.key} className="flex h-full min-w-0 flex-1 items-end">
              <div
                data-testid="trend-bar"
                title={`${point.label}: ${formatRupiah(point.totalRp)} · ${point.orderCount} transaksi`}
                className={cn(
                  "w-full min-h-0.5 rounded-t-sm",
                  point.totalRp === 0 ? "bg-muted" : point.key === trend.peak?.key ? "bg-primary" : "bg-primary/40",
                )}
                style={{ height: `${(point.totalRp / max) * 100}%` }}
              />
            </div>
          ))}
        </div>
        {empty && (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted-foreground">
            Belum ada penjualan di rentang ini.
          </p>
        )}
      </div>
      <div aria-hidden className="col-start-2 mt-1 flex overflow-hidden text-[10px] text-muted-foreground">
        {trend.points.map((point, i) => (
          <span
            key={point.key}
            className={cn(
              "min-w-0 flex-1 overflow-visible whitespace-nowrap",
              i % phoneStep !== 0 && (i % wideStep === 0 ? "invisible md:visible" : "invisible"),
            )}
          >
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}
