import { describe, expect, it } from "vitest";
import { CheckoutService } from "@/services/checkoutService";
import type { CheckoutExtension } from "@/services/ports/orders";
import { command, line, setup } from "./support/orderFixtures";

describe("CheckoutService", () => {
  it("menyimpan order, pembayaran, movement stok, dan outbox dalam satu transaksi", async () => {
    const { db, checkout } = setup();
    const r = await checkout.checkout(command());
    if (!r.ok) throw new Error(r.message);
    expect(r.order.totalRp).toBe(27_500);
    expect(r.order.changeRp).toBe(2_500);
    expect(r.order.lines.map((l) => l.chargeTotalRp)).toEqual([20_000, 7_500]);
    expect(db.payments).toHaveLength(1);
    const beans = db.movements.find((m) => m.ingredientId === "beans");
    expect(beans).toMatchObject({ type: "sale_consumption", qtyMilli: 54_000, referenceId: r.order.id });
    expect(db.outbox).toHaveLength(1);
  });

  it("kunci idempotensi yang sama mengembalikan order lama tanpa menulis ulang", async () => {
    const { db, checkout } = setup();
    const first = await checkout.checkout(command());
    const second = await checkout.checkout(command());
    expect(second).toMatchObject({ ok: true, replayed: true });
    expect(second.ok && first.ok && second.order.id === first.order.id).toBe(true);
    expect(db.orders).toHaveLength(1);
    expect(db.movements).toHaveLength(2);
  });

  it("menolak pembayaran kurang tanpa menulis apa pun", async () => {
    const { db, checkout } = setup();
    const r = await checkout.checkout(command({ payments: [{ method: "cash", amountRp: 1_000 }] }));
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(db.orders).toEqual([]);
  });

  it("menolak keranjang kosong dan baris tidak valid", async () => {
    const { db, checkout } = setup();
    expect(await checkout.checkout(command({ lines: [] }))).toMatchObject({ ok: false, code: "invalid" });
    const bad = await checkout.checkout(command({ lines: [line("a", 0)] }));
    expect(bad).toMatchObject({ ok: false, code: "invalid" });
    expect(db.orders).toEqual([]);
  });

  it("error stok membatalkan seluruh checkout", async () => {
    const { db, checkout } = setup();
    db.fail.stock = true;
    expect(await checkout.checkout(command())).toMatchObject({ ok: false, code: "failed" });
    expect([db.orders, db.payments, db.movements, db.outbox].map((t) => t.length)).toEqual([0, 0, 0, 0]);
    db.fail.stock = false;
    expect(await checkout.checkout(command())).toMatchObject({ ok: true, replayed: false });
  });

  it("stok negatif tidak menggagalkan checkout", async () => {
    const { db, checkout } = setup();
    const r = await checkout.checkout(command({ lines: [line("a", 1000, 10)], payments: [{ method: "cash", amountRp: 10_000 }] }));
    expect(r.ok).toBe(true);
    expect(db.movements.find((m) => m.ingredientId === "milk")?.qtyMilli).toBe(150_000_000);
  });

  it("ekstensi gagal membatalkan semua tulisan, termasuk tulisan ekstensi sendiri", async () => {
    const { db, deps } = setup();
    const written: string[] = [];
    const ext: CheckoutExtension = {
      id: "queue",
      apply: async (_ctx, tx) => {
        await tx.outbox.enqueue({ id: "x", entityType: "order", entityId: "q", op: "create", createdAt: "t" });
        written.push("q");
        throw new Error("queue down");
      },
    };
    const service = new CheckoutService({ ...deps, extensions: [ext] });
    expect(await service.checkout(command())).toMatchObject({ ok: false, code: "failed" });
    expect(written).toEqual(["q"]);
    expect(db.outbox).toEqual([]);
    expect(db.orders).toEqual([]);
  });

  it("ekstensi menambah diskon voucher dan menerima konteks order", async () => {
    const { db, deps } = setup();
    const seen: string[] = [];
    const ext: CheckoutExtension = {
      id: "voucher",
      promo: async () => ({ ok: true, discountsRp: { a: 5_000 }, applied: ["V1"] }),
      apply: async (ctx) => {
        seen.push(ctx.order.id);
      },
    };
    const service = new CheckoutService({ ...deps, extensions: [ext] });
    const r = await service.checkout(command());
    expect(r.ok && r.order.totalRp).toBe(22_500);
    expect(seen).toHaveLength(1);
    expect(db.orders).toHaveLength(1);
  });

  it("voucher ditolak membatalkan checkout dengan pesan Indonesia", async () => {
    const { db, deps } = setup();
    const ext: CheckoutExtension = { id: "voucher", promo: async () => ({ ok: false, reason: "voucher_expired" }) };
    const r = await new CheckoutService({ ...deps, extensions: [ext] }).checkout(command());
    expect(r).toEqual({ ok: false, code: "invalid", message: "Voucher sudah kedaluwarsa." });
    expect(db.orders).toEqual([]);
  });

  it("pajak, layanan, dan pembulatan masuk ke total order", async () => {
    const { checkout } = setup();
    const tax = { taxMode: "exclusive", taxRateBp: 1100, taxBase: "after_discount", serviceEnabled: false, serviceRateBp: 0, roundingStep: 100 } as const;
    const r = await checkout.checkout(command({ tax, payments: [{ method: "qris_manual", amountRp: 30_500 }] }));
    expect(r.ok && r.order.totalRp).toBe(30_500);
    expect(r.ok && r.order.lines.reduce((s, l) => s + l.chargeTotalRp, 0)).toBe(30_500);
  });
});
