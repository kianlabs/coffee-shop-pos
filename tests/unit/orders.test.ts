import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  allocateDiscount,
  canTransitionOrderStatus,
  createCompletedOrder,
  validateCheckout,
  validateOrderStatus,
} from "@/domain/orders";
import { sampleCheckout, sampleOrder } from "./fixtures";

describe("allocateDiscount", () => {
  it("jumlah alokasi selalu sama dengan diskon yang dibatasi total", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 500_000 }), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 2_000_000 }),
        (lines, discount) => {
          const shares = allocateDiscount(lines, discount);
          const total = lines.reduce((a, b) => a + b, 0);
          const expected = Math.min(discount, total);
          expect(shares.reduce((a, b) => a + b, 0)).toBe(total > 0 && discount > 0 ? expected : 0);
          shares.forEach((s, i) => expect(s).toBeLessThanOrEqual(lines[i]));
        },
      ),
    );
  });

  it("nol bila diskon atau total nol", () => {
    expect(allocateDiscount([1000, 2000], 0)).toEqual([0, 0]);
    expect(allocateDiscount([0, 0], 500)).toEqual([0, 0]);
  });
});

describe("validateOrderStatus", () => {
  it("menerima status yang didukung dan menolak sisanya", () => {
    expect(validateOrderStatus("completed")).toBeNull();
    expect(validateOrderStatus("voided")).toBeNull();
    expect(validateOrderStatus("refunded")).toBeNull();
    expect(validateOrderStatus("partially_refunded")).toMatch(/tidak didukung/);
    expect(validateOrderStatus("draft")).toMatch(/tidak didukung/);
    expect(validateOrderStatus("lainnya")).toMatch(/tidak dikenal/);
  });
});

describe("canTransitionOrderStatus", () => {
  it("hanya completed yang boleh menjadi voided atau refunded", () => {
    expect(canTransitionOrderStatus("completed", "voided").allowed).toBe(true);
    expect(canTransitionOrderStatus("completed", "refunded").allowed).toBe(true);
    expect(canTransitionOrderStatus("completed", "completed").allowed).toBe(false);
    expect(canTransitionOrderStatus("voided", "refunded").allowed).toBe(false);
    expect(canTransitionOrderStatus("refunded", "voided").error).toMatch(/sudah di-void/);
  });
});

describe("validateCheckout", () => {
  it("menerima checkout tunai yang valid", () => {
    expect(validateCheckout(sampleCheckout())).toBeNull();
  });

  it("menolak keranjang kosong, qty, dan harga tidak valid", () => {
    expect(validateCheckout(sampleCheckout({ lines: [] }))).toMatch(/Keranjang kosong/);
    const badQty = sampleCheckout();
    badQty.lines[0].qty = 0;
    expect(validateCheckout(badQty)).toMatch(/Qty tidak valid/);
    const badPrice = sampleCheckout();
    badPrice.lines[0].unitPriceRp = 1.5;
    expect(validateCheckout(badPrice)).toMatch(/Harga tidak valid/);
  });

  it("menolak diskon, pajak, layanan, dan pembulatan di luar aturan", () => {
    expect(validateCheckout(sampleCheckout({ discountRp: 1.5 }))).toMatch(/bilangan bulat/);
    expect(validateCheckout(sampleCheckout({ discountRp: -1 }))).toMatch(/tidak boleh negatif/);
    expect(validateCheckout(sampleCheckout({ taxRp: -1 }))).toMatch(/tidak boleh negatif/);
    expect(validateCheckout(sampleCheckout({ serviceChargeRp: -5 }))).toMatch(/Biaya layanan/);
    expect(validateCheckout(sampleCheckout({ roundingRp: 100 }))).toMatch(/Pembulatan/);
    expect(validateCheckout(sampleCheckout({ roundingRp: -1000 }))).toMatch(/Pembulatan/);
    expect(validateCheckout(sampleCheckout({ discountRp: 999_999 }))).toMatch(/melebihi subtotal/);
  });

  it("memeriksa pembayaran: metode, nominal, non-tunai harus pas, dan kurang bayar", () => {
    const badMethod = sampleCheckout();
    // @ts-expect-error sengaja memakai metode tidak dikenal untuk uji
    badMethod.payment.method = "crypto";
    expect(validateCheckout(badMethod)).toMatch(/Metode bayar tidak valid/);
    expect(validateCheckout(sampleCheckout({ payment: { method: "cash", amountRp: 1.2, paidAt: "2026-11-19T10:00:00Z" } }))).toMatch(/Nominal bayar harus/);
    expect(validateCheckout(sampleCheckout({ payment: { method: "qris_manual", amountRp: 200000, paidAt: "2026-11-19T10:00:00Z" } }))).toMatch(/non-tunai/);
    expect(validateCheckout(sampleCheckout({ payment: { method: "cash", amountRp: 1000, paidAt: "2026-11-19T10:00:00Z" } }))).toMatch(/kurang dari total/);
  });

  it("memeriksa idempotency key, tanggal bayar, dan catatan", () => {
    expect(validateCheckout(sampleCheckout({ idempotencyKey: "" }))).toMatch(/Idempotency/);
    expect(validateCheckout(sampleCheckout({ idempotencyKey: "x".repeat(129) }))).toMatch(/Idempotency/);
    expect(validateCheckout(sampleCheckout({ payment: { method: "cash", amountRp: 100000, paidAt: "bukan-tanggal" } }))).toMatch(/Tanggal bayar/);
    expect(validateCheckout(sampleCheckout({ notes: "x".repeat(1001) }))).toMatch(/Catatan maksimal/);
    expect(validateCheckout(sampleCheckout({ notes: null }))).toBeNull();
  });
});

describe("createCompletedOrder", () => {
  it("menghitung total, kembalian, dan alokasi diskon per baris", () => {
    const order = sampleOrder({ discountRp: 5000, taxRp: 2000, serviceChargeRp: 1000, roundingRp: -500 });
    expect(order.subtotalRp).toBe(18000 * 2 + 25000);
    expect(order.totalRp).toBe(61000 - 5000 + 2000 + 1000 - 500);
    expect(order.changeRp).toBe(100000 - order.totalRp);
    const allocated = order.lines.reduce((a, l) => a + l.discountRp, 0);
    expect(allocated).toBe(5000);
    expect(order.status).toBe("completed");
  });

  it("memakai nomor struk berawalan R- dan catatan null bila kosong", () => {
    const order = createCompletedOrder(sampleCheckout(), new Date());
    expect(order.receiptNumber).toMatch(/^R-[0-9A-Z]+-[0-9A-Z]{4}$/);
    expect(order.notes).toBeNull();
    expect(createCompletedOrder(sampleCheckout({ notes: "tanpa es" }), new Date()).notes).toBe("tanpa es");
  });
});
