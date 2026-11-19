import { type TrendUnit } from "@/domain/sales";

export const TREND_UNIT_LABEL: Record<TrendUnit, string> = {
  hour: "per jam",
  day: "per hari",
  week: "per minggu",
  month: "per bulan",
};

/** Short rupiah for the Y axis: 1,2 jt / 250 rb. */
export function compactRupiah(value: number): string {
  const abs = Math.abs(value);
  const fmt = (v: number, suffix: string) =>
    `${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })} ${suffix}`;
  if (abs >= 1_000_000_000) return fmt(value / 1_000_000_000, "M");
  if (abs >= 1_000_000) return fmt(value / 1_000_000, "jt");
  if (abs >= 1_000) return fmt(value / 1_000, "rb");
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
