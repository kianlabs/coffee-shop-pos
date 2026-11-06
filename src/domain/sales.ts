import type { Order } from "./orders";

export type SalesSummary = {
  start: string;
  end: string;
  /** hanya order `completed` */
  orderCount: number;
  grandTotalRp: number;
  averageRp: number;
  totalDiscountRp: number;
  totalTaxRp: number;
  totalServiceRp: number;
  voidedCount: number;
  voidedTotalRp: number;
  refundedCount: number;
  refundedTotalRp: number;
  totalHppRp: number;
  grossProfitRp: number;
  profitMarginPct: number | null;
};

export type TopProduct = {
  productId: string;
  productName: string;
  qty: number;
  grossRp: number;
  profitRp: number;
};

export type PaymentBreakdownItem = {
  method: string;
  orderCount: number;
  totalRp: number;
};

export type TrendUnit = "hour" | "day" | "week" | "month";

export type SalesTrendPoint = {
  key: string;
  label: string;
  totalRp: number;
  orderCount: number;
  profitRp: number;
};

export type SalesTrend = {
  unit: TrendUnit;
  points: SalesTrendPoint[];
  totalRp: number;
  orderCount: number;
  maxTotalRp: number;
  peak: SalesTrendPoint | null;
};

/** Batas rentang yang umum dipakai kasir. */
export type Preset = "today" | "yesterday" | "thisWeek" | "last7" | "custom";

export function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export function rangeFor(preset: Exclude<Preset, "custom">, now: Date = new Date()): { start: Date; end: Date } {
  if (preset === "today") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }
  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { start: startOfDay(y), end: endOfDay(y) };
  }
  if (preset === "last7") {
    const s = new Date(now);
    s.setDate(s.getDate() - 6);
    return { start: startOfDay(s), end: endOfDay(now) };
  }
  // thisWeek: Senin–Minggu.
  const monday = new Date(now);
  const dow = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - dow);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return { start: startOfDay(monday), end: endOfDay(sunday) };
}

/** Order yang dibuat dalam rentang tutup (inklusif). */
export function ordersInRange(orders: Order[], start: Date, end: Date): Order[] {
  const s = start.getTime();
  const e = end.getTime();
  return orders.filter((o) => {
    const t = Date.parse(o.createdAt);
    return Number.isFinite(t) && t >= s && t <= e;
  });
}

function lineHpp(l: Order["lines"][number]): number {
  return typeof l.hppTotal === "number" && l.hppTotal > 0 ? l.hppTotal : 0;
}

function lineNet(l: Order["lines"][number]): number {
  return typeof l.netTotalRp === "number" ? l.netTotalRp : l.lineTotalRp;
}

/**
 * Ringkasan penjualan dari order yang ter-load.
 *
 * Laba dari SNAPSHOT di row (bukan dihitung ulang dari harga bahan sekarang),
 * sehingga laporan tidak berubah saat harga bahan naik:
 *   laba per baris = netTotalRp (sudah dikurangi diskon) − hpp_total_rp.
 */
export function summarizeSales(all: Order[], start: Date, end: Date): SalesSummary {
  const rows = ordersInRange(all, start, end);
  let orderCount = 0;
  let grandTotalRp = 0;
  let totalDiscountRp = 0;
  let totalTaxRp = 0;
  let totalServiceRp = 0;
  let voidedCount = 0;
  let voidedTotalRp = 0;
  let refundedCount = 0;
  let refundedTotalRp = 0;
  let totalHppRp = 0;
  let grossProfitRp = 0;

  for (const o of rows) {
    if (o.status === "voided") {
      voidedCount += 1;
      voidedTotalRp += o.totalRp;
      continue;
    }
    if (o.status === "refunded") {
      refundedCount += 1;
      refundedTotalRp += o.totalRp;
      continue;
    }
    if (o.status !== "completed") continue;
    orderCount += 1;
    grandTotalRp += o.totalRp;
    totalDiscountRp += o.discountRp;
    totalTaxRp += o.taxRp;
    totalServiceRp += o.serviceChargeRp ?? 0;

    for (const l of o.lines) {
      const h = lineHpp(l);
      totalHppRp += h;
      grossProfitRp += lineNet(l) - h;
    }
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    orderCount,
    grandTotalRp,
    averageRp: orderCount > 0 ? Math.round(grandTotalRp / orderCount) : 0,
    totalDiscountRp,
    totalTaxRp,
    totalServiceRp,
    voidedCount,
    voidedTotalRp,
    refundedCount,
    refundedTotalRp,
    totalHppRp,
    grossProfitRp,
    profitMarginPct: grandTotalRp > 0 ? Math.round((grossProfitRp / grandTotalRp) * 1000) / 10 : null,
  };
}

/** Produk terlaris dari order completed dalam rentang. */
export function topProducts(all: Order[], start: Date, end: Date, limit = 10): TopProduct[] {
  const byProduct = new Map<string, TopProduct>();
  for (const o of ordersInRange(all, start, end)) {
    if (o.status !== "completed") continue;
    for (const l of o.lines) {
      const key = l.productId || `${l.productName}::${l.variantName ?? ""}`;
      const row = byProduct.get(key) ?? {
        productId: l.productId,
        productName: l.productName,
        qty: 0,
        grossRp: 0,
        profitRp: 0,
      };
      row.qty += l.qty;
      row.grossRp += l.lineTotalRp;
      row.profitRp += lineNet(l) - lineHpp(l);
      byProduct.set(key, row);
    }
  }
  return [...byProduct.values()].sort((a, b) => b.qty - a.qty).slice(0, Math.max(1, limit));
}

/** Rincian per metode bayar (completed saja). */
export function paymentBreakdown(all: Order[], start: Date, end: Date): PaymentBreakdownItem[] {
  const byMethod = new Map<string, PaymentBreakdownItem>();
  for (const o of ordersInRange(all, start, end)) {
    if (o.status !== "completed") continue;
    const row = byMethod.get(o.payment.method) ?? { method: o.payment.method, orderCount: 0, totalRp: 0 };
    row.orderCount += 1;
    // Omzet per metode = total order, BUKAN uang diterima. Kalau kasir menerima
    // Rp50.000 untuk order Rp30.000, yang dihitung tetap Rp30.000.
    row.totalRp += o.totalRp;
    byMethod.set(o.payment.method, row);
  }
  return [...byMethod.values()].sort((a, b) => b.totalRp - a.totalRp);
}

function startOfWeek(d: Date): Date {
  const copy = startOfDay(d);
  const dow = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - dow);
  return copy;
}

function startOfMonth(d: Date): Date {
  const copy = startOfDay(d);
  copy.setDate(1);
  return copy;
}

function trendUnitFor(start: Date, end: Date): TrendUnit {
  if (start.toDateString() === end.toDateString()) return "hour";
  const span = end.getTime() - start.getTime();
  if (span <= 31 * 86_400_000) return "day";
  if (span <= 180 * 86_400_000) return "week";
  return "month";
}

function bucketStart(d: Date, unit: TrendUnit): Date {
  if (unit === "hour") {
    const copy = new Date(d);
    copy.setMinutes(0, 0, 0);
    return copy;
  }
  if (unit === "day") return startOfDay(d);
  if (unit === "week") return startOfWeek(d);
  return startOfMonth(d);
}

function addBucket(d: Date, unit: TrendUnit): Date {
  const copy = new Date(d);
  if (unit === "hour") copy.setHours(copy.getHours() + 1);
  else if (unit === "day") copy.setDate(copy.getDate() + 1);
  else if (unit === "week") copy.setDate(copy.getDate() + 7);
  else copy.setMonth(copy.getMonth() + 1);
  return copy;
}

function bucketKey(d: Date, unit: TrendUnit): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = p(d.getMonth() + 1);
  const day = p(d.getDate());
  if (unit === "hour") return `${y}-${m}-${day}T${p(d.getHours())}`;
  if (unit === "month") return `${y}-${m}`;
  return `${y}-${m}-${day}`;
}

function bucketLabel(d: Date, unit: TrendUnit): string {
  if (unit === "hour") return `${String(d.getHours()).padStart(2, "0")}.00`;
  if (unit === "month") {
    return d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

/**
 * Deret omzet untuk grafik laporan.
 *
 * Satuan bucket menyesuaikan rentang supaya grafik tetap terbaca:
 * satu hari → per jam, ≤31 hari → per hari, ≤180 hari → per minggu,
 * lebih dari itu → per bulan. Hanya order `completed` yang dihitung.
 */
export function salesTrend(all: Order[], start: Date, end: Date): SalesTrend {
  const unit = trendUnitFor(start, end);
  const first = bucketStart(start, unit);
  const last = bucketStart(end, unit);
  const points: SalesTrendPoint[] = [];
  for (let cursor = first; cursor.getTime() <= last.getTime(); cursor = addBucket(cursor, unit)) {
    points.push({
      key: bucketKey(cursor, unit),
      label: bucketLabel(cursor, unit),
      totalRp: 0,
      orderCount: 0,
      profitRp: 0,
    });
  }

  const index = new Map(points.map((point, i) => [point.key, i]));
  for (const order of ordersInRange(all, start, end)) {
    if (order.status !== "completed") continue;
    const when = new Date(order.createdAt);
    if (!Number.isFinite(when.getTime())) continue;
    const i = index.get(bucketKey(when, unit));
    if (i === undefined) continue;
    const point = points[i];
    point.totalRp += order.totalRp;
    point.orderCount += 1;
    point.profitRp += order.lines.reduce((sum, l) => sum + lineNet(l) - lineHpp(l), 0);
  }

  let peak: SalesTrendPoint | null = null;
  for (const point of points) {
    if (point.totalRp > (peak?.totalRp ?? 0)) peak = point;
  }

  return {
    unit,
    points,
    totalRp: points.reduce((sum, p) => sum + p.totalRp, 0),
    orderCount: points.reduce((sum, p) => sum + p.orderCount, 0),
    maxTotalRp: peak?.totalRp ?? 0,
    peak,
  };
}

export function formatRangeLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  const s = fmt(start);
  const e = fmt(end);
  return s === e ? s : `${s} – ${e}`;
}
