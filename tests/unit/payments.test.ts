import { describe, expect, it } from "vitest";
import { suggestCashAmounts, validatePayments, type PaymentEntry } from "@/domain/payments";
const CFG = { maxPerOrder: 10 };
const cash = (amountRp: number): PaymentEntry => ({ method: "cash", amountRp });
const qris = (amountRp: number): PaymentEntry => ({ method: "qris_manual", amountRp });
describe("validatePayments: contoh", () => {
  it("tunai lebih memberi kembalian", () => {
    expect(validatePayments(23_500, [cash(50_000)], CFG)).toEqual({ ok: true, paidRp: 50_000, changeRp: 26_500 });
  });
  it("split non-tunai lalu tunai", () => {
    const r = validatePayments(100_000, [qris(60_000), { method: "card_edc", amountRp: 20_000 }, cash(50_000)], CFG);
    expect(r).toEqual({ ok: true, paidRp: 130_000, changeRp: 30_000 });
  });
  it("non-tunai pas tanpa kembalian", () => {
    expect(validatePayments(15_000, [{ method: "bank_transfer", amountRp: 15_000 }], CFG)).toEqual({
      ok: true,
      paidRp: 15_000,
      changeRp: 0,
    });
  });
  it("non-tunai melebihi sisa ditolak dengan sisa saat itu", () => {
    const r = validatePayments(100_000, [cash(30_000), qris(80_000)], CFG);
    expect(r).toMatchObject({ ok: false, code: "non_cash_exceeds", index: 1, remainingRp: 70_000 });
  });
  it("menolak nominal kosong, 0, negatif, pecahan, atau di atas batas", () => {
    for (const amount of [0, -1, 1.5, Number.NaN, 1_000_000_000]) {
      const r = validatePayments(10_000, [cash(amount)], CFG);
      expect(r).toMatchObject({ ok: false, code: "invalid_amount", index: 0 });
      if (!r.ok) expect(r.message).toBe("Nominal harus bilangan bulat 1–999.999.999 Rupiah.");
    }
    expect(validatePayments(999_999_999, [cash(999_999_999)], CFG).ok).toBe(true);
  });
  it("menolak melebihi batas jumlah pembayaran", () => {
    const r = validatePayments(5, [cash(1), cash(1), cash(1)], { maxPerOrder: 2 });
    expect(r).toMatchObject({ ok: false, code: "too_many", index: null });
    if (!r.ok) expect(r.message).toBe("Satu order maksimal memiliki 2 pembayaran.");
  });
  it("menolak pembayaran setelah lunas dan metode tidak dikenal", () => {
    expect(validatePayments(10_000, [cash(20_000), cash(1_000)], CFG)).toMatchObject({ code: "already_paid", index: 1 });
    expect(validatePayments(0, [cash(1_000)], CFG)).toMatchObject({ code: "already_paid", index: 0 });
    const unknown = { method: "crypto", amountRp: 1_000 } as unknown as PaymentEntry;
    expect(validatePayments(1_000, [unknown], CFG)).toMatchObject({ code: "invalid_method" });
  });
  it("kurang bayar memberi sisa tagihan", () => {
    const r = validatePayments(50_000, [qris(20_000)], CFG);
    expect(r).toMatchObject({ ok: false, code: "insufficient", remainingRp: 30_000 });
    if (!r.ok) expect(r.message).toContain("30.000");
    expect(validatePayments(50_000, [], CFG)).toMatchObject({ code: "insufficient", remainingRp: 50_000 });
  });
  it("total 0 tanpa pembayaran diterima", () => {
    expect(validatePayments(0, [], CFG)).toEqual({ ok: true, paidRp: 0, changeRp: 0 });
  });
  it("melempar RangeError untuk total atau konfigurasi tidak valid", () => {
    expect(() => validatePayments(-1, [], CFG)).toThrow(RangeError);
    expect(() => validatePayments(1.5, [], CFG)).toThrow(RangeError);
    expect(() => validatePayments(1, [], { maxPerOrder: 0 })).toThrow(RangeError);
    expect(() => validatePayments(1, [], { maxPerOrder: 21 })).toThrow(RangeError);
  });
});
describe("suggestCashAmounts", () => {
  it("uang pas lebih dulu lalu nominal bulat di atasnya", () => {
    expect(suggestCashAmounts(23_500)).toEqual([23_500, 25_000, 30_000, 50_000, 100_000]);
    expect(suggestCashAmounts(25_000)).toEqual([25_000, 30_000, 50_000, 100_000]);
    expect(suggestCashAmounts(95_000)).toEqual([95_000, 100_000]);
    expect(suggestCashAmounts(100_000)).toEqual([100_000, 105_000, 110_000, 150_000, 200_000]);
  });
  it("kosong untuk total ≤ 0 atau di atas batas, tanpa melewati batas", () => {
    expect(suggestCashAmounts(0)).toEqual([]);
    expect(suggestCashAmounts(-5)).toEqual([]);
    expect(suggestCashAmounts(1_000_000_000)).toEqual([]);
    expect(suggestCashAmounts(999_999_999)).toEqual([999_999_999]);
    expect(suggestCashAmounts(999_996_000)).toEqual([999_996_000]);
    expect(suggestCashAmounts(999_994_000)).toEqual([999_994_000, 999_995_000]);
  });
});
