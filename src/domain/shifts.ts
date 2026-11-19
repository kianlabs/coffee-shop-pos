import type { Order } from "./orders";

export type Shift = {
  id: string;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  openCashRp: number;
};

export type ShiftSummary = {
  orderCount: number;
  grandTotalRp: number;
};

function newShiftId(): string {
  try {
    if (typeof globalThis === "object" && "crypto" in globalThis) {
      // SAFETY: globalThis.crypto tidak punya tipe randomUUID di semua target TS —
      // invariant: properti hanya dipakai bila typeof randomUUID === "function".
      const cryptoObj = globalThis.crypto as unknown as { randomUUID?: () => string };
      if (typeof cryptoObj.randomUUID === "function") {
        return `shift-${cryptoObj.randomUUID()}`;
      }
    }
  } catch {
    // Fallback ke Math.random di bawah.
  }
  return `shift-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/**
 * Buka shift baru. Pure (tanpa DB/IO): App yang menyimpan hasilnya.
 * DEFAULT: openCashRp 0 (tanpa modal awal tercatat).
 */
export function openShift(cashierName: string, openCashRp = 0): Shift {
  const name = typeof cashierName === "string" ? cashierName.trim() : "";
  const openCash =
    Number.isInteger(openCashRp) && openCashRp > 0 ? openCashRp : 0;
  const openedAt = new Date().toISOString();
  return {
    id: newShiftId(),
    cashierName: name,
    openedAt,
    closedAt: null,
    openCashRp: openCash,
  };
}

/**
 * Ringkasan shift dari daftar Order (pure): hanya order `completed` yang
 * `createdAt`-nya berada dalam rentang shift yang dihitung.
 */
export function summarizeShift(shift: Shift, orders: Order[]): ShiftSummary {
  const openMs = Date.parse(shift.openedAt);
  const closeMs = shift.closedAt ? Date.parse(shift.closedAt) : Number.POSITIVE_INFINITY;
  let orderCount = 0;
  let grandTotalRp = 0;
  for (const o of orders) {
    if (o.status !== "completed") {
      continue;
    }
    const createdMs = Date.parse(o.createdAt);
    if (Number.isNaN(createdMs) || createdMs < openMs || createdMs > closeMs) {
      continue;
    }
    orderCount += 1;
    grandTotalRp += o.totalRp;
  }
  return { orderCount, grandTotalRp };
}

/**
 * Tutup shift: cap `closedAt` + hitung ringkasan dari Order[].
 * Pure — tanpa DB; persistensi shift menjadi wewenang lapisan data/UI.
 */
export function closeShift(
  shift: Shift,
  orders: Order[],
  now: Date = new Date(),
): { shift: Shift; summary: ShiftSummary } {
  const closed: Shift = { ...shift, closedAt: now.toISOString() };
  const summary = summarizeShift(closed, orders);
  return { shift: closed, summary };
}
export type CashFlowKind = "sale" | "refund";
export interface ShiftPayment {
  method: string;
  amountRp: number;
  /** ISO time the payment (or refund payout) was recorded. */
  recordedAt: string;
  kind: CashFlowKind;
  status?: "completed" | "voided";
}
export interface CashEntry {
  type: "cash_in" | "cash_out";
  amountRp: number;
}
export interface DrawerExpense {
  amountRp: number;
  recordedAt: string;
}
export interface ExpectedCashInput {
  openCashRp: number;
  openedAt: string;
  closedAt: string;
  /** Payments recorded on this device; filtered here by method and time window. */
  payments: readonly ShiftPayment[];
  /** Cash entries belonging to this shift. */
  cashEntries: readonly CashEntry[];
  drawerExpenses?: readonly DrawerExpense[];
}
export interface ExpectedCashBreakdown {
  openCashRp: number;
  cashSalesRp: number;
  cashInRp: number;
  cashOutRp: number;
  cashRefundsRp: number;
  drawerExpensesRp: number;
  expectedCashRp: number;
}
export const COUNTED_CASH_MAX_RP = 1_000_000_000;
function inWindow(at: string, openMs: number, closeMs: number): boolean {
  const ms = Date.parse(at);
  return !Number.isNaN(ms) && ms >= openMs && ms <= closeMs;
}
function sumRp(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0);
}
/**
 * expectedCash = open + cashSales + cashIn − cashOut − cashRefunds − drawerExpenses.
 * Only cash payments and drawer expenses recorded within [openedAt, closedAt] count.
 */
export function expectedCash(input: ExpectedCashInput): ExpectedCashBreakdown {
  const openMs = Date.parse(input.openedAt);
  const closeMs = Date.parse(input.closedAt);
  if (Number.isNaN(openMs) || Number.isNaN(closeMs)) {
    throw new Error("Waktu buka atau tutup Shift tidak valid.");
  }
  const cash = input.payments.filter(
    (p) => p.method === "cash" && p.status !== "voided" && inWindow(p.recordedAt, openMs, closeMs),
  );
  const cashSalesRp = sumRp(cash.filter((p) => p.kind === "sale").map((p) => p.amountRp));
  const cashRefundsRp = sumRp(cash.filter((p) => p.kind === "refund").map((p) => p.amountRp));
  const cashInRp = sumRp(input.cashEntries.filter((e) => e.type === "cash_in").map((e) => e.amountRp));
  const cashOutRp = sumRp(input.cashEntries.filter((e) => e.type === "cash_out").map((e) => e.amountRp));
  const expenses = (input.drawerExpenses ?? []).filter((e) => inWindow(e.recordedAt, openMs, closeMs));
  const drawerExpensesRp = sumRp(expenses.map((e) => e.amountRp));
  const expectedCashRp =
    input.openCashRp + cashSalesRp + cashInRp - cashOutRp - cashRefundsRp - drawerExpensesRp;
  return {
    openCashRp: input.openCashRp,
    cashSalesRp,
    cashInRp,
    cashOutRp,
    cashRefundsRp,
    drawerExpensesRp,
    expectedCashRp,
  };
}
/** Returns an error message, or null when counted cash is an integer 0–1.000.000.000 Rupiah. */
export function validateCountedCash(countedRp: number): string | null {
  if (!Number.isInteger(countedRp) || countedRp < 0 || countedRp > COUNTED_CASH_MAX_RP) {
    return "Kas terhitung harus bilangan bulat Rupiah 0 sampai 1.000.000.000.";
  }
  return null;
}
/** Cash difference: counted − expected (positive = surplus, negative = shortage). */
export function cashDifference(countedRp: number, expectedRp: number): number {
  return countedRp - expectedRp;
}
