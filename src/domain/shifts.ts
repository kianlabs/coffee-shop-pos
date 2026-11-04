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
