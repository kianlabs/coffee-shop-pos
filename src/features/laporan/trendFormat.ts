import { type TrendUnit } from "@/domain/sales";

/** i18n keys for the unit phrase in trend descriptions, e.g. "per jam". */
export const TREND_UNIT_KEY: Record<TrendUnit, string> = {
  hour: "laporan.unit.hour",
  day: "laporan.unit.day",
  week: "laporan.unit.week",
  month: "laporan.unit.month",
};

export interface CompactLabels {
  billion: string;
  million: string;
  thousand: string;
}

/** Short rupiah for the Y axis: 1,2 jt / 250 rb (id) or 1.2 M / 250 K (en). */
export function compactRupiah(value: number, labels: CompactLabels): string {
  const abs = Math.abs(value);
  const fmt = (v: number, suffix: string) =>
    `${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })} ${suffix}`;
  if (abs >= 1_000_000_000) return fmt(value / 1_000_000_000, labels.billion);
  if (abs >= 1_000_000) return fmt(value / 1_000_000, labels.million);
  if (abs >= 1_000) return fmt(value / 1_000, labels.thousand);
  return value.toLocaleString("id-ID");
}

/** Round the axis maximum up so grid lines land on readable numbers. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const norm = value / base;
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const step = steps.find((s) => norm <= s) ?? 10;
  return step * base;
}
