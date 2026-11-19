import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PAYMENT_METHODS, validatePayments, type PaymentEntry } from "@/domain/payments";
const methodArb = fc.constantFrom(...PAYMENT_METHODS);
const entryArb: fc.Arbitrary<PaymentEntry> = fc.record({
  method: methodArb,
  amountRp: fc.integer({ min: 1, max: 999_999_999 }),
});
const maxArb = fc.integer({ min: 1, max: 20 });
// Reference model: non-cash ≤ remaining, nothing after settled, change only from cash.
function model(total: number, payments: PaymentEntry[]): boolean {
  let remaining = total;
  for (const p of payments) {
    if (remaining === 0) return false;
    if (p.method !== "cash" && p.amountRp > remaining) return false;
    remaining = Math.max(0, remaining - p.amountRp);
  }
  return remaining === 0;
}
describe("Property 3: Payment and change invariant", () => {
  // Validates: Requirements 6.2, 6.4, 6.5, 6.7, 6.9, 6.10
  it("diterima hanya bila aturan terpenuhi; Σ bayar − kembalian = total", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5_000_000 }), fc.array(entryArb, { minLength: 1, maxLength: 20 }), maxArb, (total, payments, max) => {
        const r = validatePayments(total, payments, { maxPerOrder: max });
        const expectedOk = payments.length <= max && model(total, payments);
        expect(r.ok).toBe(expectedOk);
        if (!r.ok) return;
        const paid = payments.reduce((s, p) => s + p.amountRp, 0);
        expect(r.paidRp).toBe(paid);
        expect(r.paidRp - r.changeRp).toBe(total);
        expect(r.changeRp).toBeGreaterThanOrEqual(0);
        if (r.changeRp > 0) expect(payments.some((p) => p.method === "cash")).toBe(true);
      }),
    );
  });
  it("daftar valid yang dibangun dari sisa tagihan selalu diterima", () => {
    const caseArb = fc.integer({ min: 1, max: 5_000_000 }).chain((total) =>
      fc.record({
        total: fc.constant(total),
        splits: fc.array(fc.integer({ min: 1, max: 9 }), { maxLength: 8 }),
        cashOver: fc.integer({ min: 0, max: 100_000 }),
      }),
    );
    fc.assert(
      fc.property(caseArb, ({ total, splits, cashOver }) => {
        const payments: PaymentEntry[] = [];
        let remaining = total;
        for (const s of splits) {
          const part = Math.floor((remaining * s) / 10);
          if (part < 1) break;
          payments.push({ method: "qris_manual", amountRp: part });
          remaining -= part;
        }
        if (remaining > 0) payments.push({ method: "cash", amountRp: remaining + cashOver });
        const r = validatePayments(total, payments, { maxPerOrder: 20 });
        expect(r).toEqual({ ok: true, paidRp: total + (remaining > 0 ? cashOver : 0), changeRp: remaining > 0 ? cashOver : 0 });
      }),
    );
  });
  it("nominal ≤ 0, pecahan, atau > 999.999.999 selalu ditolak", () => {
    const badAmount = fc.oneof(
      fc.integer({ min: -1_000_000, max: 0 }),
      fc.integer({ min: 1_000_000_000, max: 2_000_000_000 }),
      fc.double({ min: 0, max: 1e6, noNaN: true }).filter((x) => !Number.isInteger(x)),
    );
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5_000_000 }), fc.array(entryArb, { maxLength: 5 }), methodArb, badAmount, (total, before, method, amount) => {
        const r = validatePayments(total, [{ method, amountRp: amount }, ...before], { maxPerOrder: 20 });
        expect(r).toMatchObject({ ok: false, code: "invalid_amount", index: 0 });
      }),
    );
  });
  it("daftar melebihi batas selalu ditolak", () => {
    fc.assert(
      fc.property(maxArb, fc.integer({ min: 0, max: 5_000_000 }), (max, total) => {
        const payments = Array.from({ length: max + 1 }, () => ({ method: "cash" as const, amountRp: 1 }));
        expect(validatePayments(total, payments, { maxPerOrder: max })).toMatchObject({ ok: false, code: "too_many" });
      }),
    );
  });
});
