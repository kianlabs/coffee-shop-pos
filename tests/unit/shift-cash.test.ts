import { describe, expect, it } from "vitest";
import {
  cashDifference,
  closeShift,
  expectedCash,
  openShift,
  summarizeShift,
  validateCountedCash,
  type ExpectedCashInput,
} from "@/domain/shifts";

const OPEN = "2026-11-05T08:00:00.000Z";
const CLOSE = "2026-11-05T16:00:00.000Z";

function baseInput(over: Partial<ExpectedCashInput> = {}): ExpectedCashInput {
  return { openCashRp: 200_000, openedAt: OPEN, closedAt: CLOSE, payments: [], cashEntries: [], ...over };
}

describe("expectedCash", () => {
  it("hanya modal awal bila tidak ada transaksi", () => {
    expect(expectedCash(baseInput()).expectedCashRp).toBe(200_000);
  });

  it("menjumlahkan penjualan tunai, kas masuk/keluar, refund tunai, dan pengeluaran laci", () => {
    const result = expectedCash(
      baseInput({
        payments: [
          { method: "cash", amountRp: 50_000, recordedAt: "2026-11-05T09:00:00.000Z", kind: "sale" },
          { method: "cash", amountRp: 30_000, recordedAt: OPEN, kind: "sale" },
          { method: "qris_manual", amountRp: 99_000, recordedAt: "2026-11-05T09:00:00.000Z", kind: "sale" },
          { method: "cash", amountRp: 10_000, recordedAt: CLOSE, kind: "refund" },
        ],
        cashEntries: [
          { type: "cash_in", amountRp: 100_000 },
          { type: "cash_out", amountRp: 25_000 },
        ],
        drawerExpenses: [{ amountRp: 15_000, recordedAt: "2026-11-05T12:00:00.000Z" }],
      }),
    );
    expect(result).toEqual({
      openCashRp: 200_000,
      cashSalesRp: 80_000,
      cashInRp: 100_000,
      cashOutRp: 25_000,
      cashRefundsRp: 10_000,
      drawerExpensesRp: 15_000,
      expectedCashRp: 200_000 + 80_000 + 100_000 - 25_000 - 10_000 - 15_000,
    });
  });

  it("mengabaikan pembayaran di luar rentang Shift, voided, atau waktu rusak", () => {
    const result = expectedCash(
      baseInput({
        payments: [
          { method: "cash", amountRp: 1, recordedAt: "2026-11-05T07:59:59.999Z", kind: "sale" },
          { method: "cash", amountRp: 2, recordedAt: "2026-11-05T16:00:00.001Z", kind: "refund" },
          { method: "cash", amountRp: 4, recordedAt: "bukan-waktu", kind: "sale" },
          { method: "cash", amountRp: 8, recordedAt: "2026-11-05T10:00:00.000Z", kind: "sale", status: "voided" },
        ],
        drawerExpenses: [{ amountRp: 16, recordedAt: "2026-11-04T10:00:00.000Z" }],
      }),
    );
    expect(result.expectedCashRp).toBe(200_000);
    expect(result.cashSalesRp + result.cashRefundsRp + result.drawerExpensesRp).toBe(0);
  });

  it("menolak waktu Shift yang tidak valid", () => {
    expect(() => expectedCash(baseInput({ closedAt: "x" }))).toThrow();
  });
});

describe("validateCountedCash dan cashDifference", () => {
  it("menerima integer 0–1.000.000.000 saja", () => {
    expect(validateCountedCash(0)).toBeNull();
    expect(validateCountedCash(1_000_000_000)).toBeNull();
    expect(validateCountedCash(-1)).not.toBeNull();
    expect(validateCountedCash(1_000_000_001)).not.toBeNull();
    expect(validateCountedCash(10.5)).not.toBeNull();
  });
  it("selisih = kas terhitung − kas seharusnya", () => {
    expect(cashDifference(250_000, 250_000)).toBe(0);
    expect(cashDifference(240_000, 250_000)).toBe(-10_000);
    expect(cashDifference(260_000, 250_000)).toBe(10_000);
  });
});

describe("ekspor Shift lama tetap berfungsi", () => {
  it("openShift, summarizeShift, closeShift", () => {
    const shift = openShift("  Ani ", 50_000);
    expect(shift.cashierName).toBe("Ani");
    expect(shift.openCashRp).toBe(50_000);
    expect(openShift("B", -5).openCashRp).toBe(0);
    expect(summarizeShift(shift, []).orderCount).toBe(0);
    const closed = closeShift(shift, [], new Date("2030-01-01T00:00:00.000Z"));
    expect(closed.shift.closedAt).toBe("2030-01-01T00:00:00.000Z");
    expect(closed.summary).toEqual({ orderCount: 0, grandTotalRp: 0 });
  });
});
