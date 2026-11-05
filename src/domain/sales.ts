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

export function formatRangeLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  const s = fmt(start);
  const e = fmt(end);
  return s === e ? s : `${s} – ${e}`;
}
