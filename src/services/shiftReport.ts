import { type ExpectedCashBreakdown, type ShiftPayment } from "@/domain/shifts";
import type { CashEntryRecord, ShiftRecord } from "./ports/shifts";

/** Laporan_Z data for a closed shift. Printing and layout live elsewhere. */
export interface ZReport {
  shift: ShiftRecord;
  cash: ExpectedCashBreakdown;
  countedCashRp: number;
  differenceRp: number;
  differenceReason: string | null;
  entries: CashEntryRecord[];
  salesByMethod: Record<string, number>;
  refundsByMethod: Record<string, number>;
}

export function byMethod(payments: readonly ShiftPayment[], kind: ShiftPayment["kind"]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of payments) {
    if (p.kind !== kind || p.status === "voided") continue;
    out[p.method] = (out[p.method] ?? 0) + p.amountRp;
  }
  return out;
}

export interface ZReportInput {
  shift: ShiftRecord;
  entries: CashEntryRecord[];
  payments: readonly ShiftPayment[];
  cash: ExpectedCashBreakdown;
}

export function buildZReport(input: ZReportInput): ZReport {
  const { shift, entries, payments, cash } = input;
  const windowed = payments.filter((p) => p.recordedAt >= shift.openedAt && p.recordedAt <= (shift.closedAt ?? p.recordedAt));
  return {
    shift,
    cash,
    countedCashRp: shift.countedCashRp ?? 0,
    differenceRp: shift.differenceRp ?? 0,
    differenceReason: shift.differenceReason,
    entries,
    salesByMethod: byMethod(windowed, "sale"),
    refundsByMethod: byMethod(windowed, "refund"),
  };
}

