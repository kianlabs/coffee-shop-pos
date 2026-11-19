import type { Order } from "./orders";
import {
  ordersInRange,
  paymentBreakdown,
  summarizeSales,
  topProducts,
  type PaymentBreakdownItem,
  type SalesSummary,
  type TopProduct,
} from "./sales";

export type HourSlot = { hour: number; orderCount: number; totalRp: number };

export type SalesReport = {
  start: string;
  end: string;
  /** Total order completed + refunded (void tidak dihitung). */
  grossRp: number;
  discountRp: number;
  taxRp: number;
  serviceChargeRp: number;
  refundedRp: number;
  /** grossRp - refundedRp. */
  netRp: number;
  hppRp: number;
  grossProfitRp: number;
  orderCount: number;
  voidedCount: number;
  voidedRp: number;
  isEmpty: boolean;
};

export type Report = {
  summary: SalesReport;
  payments: PaymentBreakdownItem[];
  products: TopProduct[];
  hours: HourSlot[];
};

/** Rentang valid: awal <= akhir dan panjang (hari kalender, inklusif) <= maxDays. */
export function validateReportRange(start: Date, end: Date, maxDays: number): string | null {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return "Tanggal tidak valid.";
  if (start.getTime() > end.getTime()) return "Tanggal awal tidak boleh setelah tanggal akhir.";
  const days = Math.ceil((end.getTime() - start.getTime() + 1) / 86_400_000);
  if (days > maxDays) return `Rentang laporan maksimal ${maxDays} hari.`;
  return null;
}

function toReport(s: SalesSummary): SalesReport {
  const grossRp = s.grandTotalRp + s.refundedTotalRp;
  return {
    start: s.start,
    end: s.end,
    grossRp,
    discountRp: s.totalDiscountRp,
    taxRp: s.totalTaxRp,
    serviceChargeRp: s.totalServiceRp,
    refundedRp: s.refundedTotalRp,
    netRp: grossRp - s.refundedTotalRp,
    hppRp: s.totalHppRp,
    grossProfitRp: s.grossProfitRp,
    orderCount: s.orderCount,
    voidedCount: s.voidedCount,
    voidedRp: s.voidedTotalRp,
    isEmpty: s.orderCount + s.refundedCount + s.voidedCount === 0,
  };
}

export function salesReport(all: Order[], start: Date, end: Date): SalesReport {
  return toReport(summarizeSales(all, start, end));
}

/** 24 slot jam (waktu lokal perangkat), hanya order completed. */
export function hourlyBreakdown(all: Order[], start: Date, end: Date): HourSlot[] {
  const slots: HourSlot[] = Array.from({ length: 24 }, (_, hour) => ({ hour, orderCount: 0, totalRp: 0 }));
  for (const o of ordersInRange(all, start, end)) {
    if (o.status !== "completed") continue;
    const slot = slots[new Date(o.createdAt).getHours()];
    slot.orderCount += 1;
    slot.totalRp += o.totalRp;
  }
  return slots;
}

export function buildReport(all: Order[], start: Date, end: Date): Report {
  return {
    summary: salesReport(all, start, end),
    payments: paymentBreakdown(all, start, end),
    // Tanpa batas: rincian harus mencakup semua produk agar total cocok.
    products: topProducts(all, start, end, Number.MAX_SAFE_INTEGER),
    hours: hourlyBreakdown(all, start, end),
  };
}
