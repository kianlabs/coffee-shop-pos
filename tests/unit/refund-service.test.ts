import { describe, expect, it } from "vitest";
import { command, refundCmd, setup } from "./support/orderFixtures";

async function placed() {
  const s = setup();
  const r = await s.checkout.checkout(command());
  if (!r.ok) throw new Error(r.message);
  return { ...s, order: r.order };
}

const sum = (db: { movements: Array<{ ingredientId: string; type: string; qtyMilli: number }> }, id: string, type: string) =>
  db.movements.filter((m) => m.ingredientId === id && m.type === type).reduce((s, m) => s + m.qtyMilli, 0);

describe("RefundService", () => {
  it("refund parsial: nominal proporsional, stok kembali, status partially_refunded, audit tercatat", async () => {
    const { db, refunds, order } = await placed();
    const lineA = order.lines[0].lineId;
    const r = await refunds.refund(refundCmd(order.id, { items: [{ lineId: lineA, qty: 1 }] }));
    if (!r.ok) throw new Error(r.message);
    expect(r.refund).toMatchObject({ amountRp: 10_000, kind: "partial", resultStatus: "partially_refunded", reason: "Salah pesan" });
    expect(db.orders[0].status).toBe("partially_refunded");
    expect(sum(db, "beans", "return_in")).toBe(18_000);
    expect(db.movements.filter((m) => m.type === "return_in").every((m) => m.referenceId === r.refund.id)).toBe(true);
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ actorId: "u-sup", approverId: "u-sup", reason: "Salah pesan", before: { status: "completed", totalRp: 27_500 } });
  });

  it("refund sisa menjadi full, total refund sama dengan total order, stok kembali penuh", async () => {
    const { db, refunds, order } = await placed();
    const [a, b] = order.lines;
    await refunds.refund(refundCmd(order.id, { idempotencyKey: "r-1", items: [{ lineId: a.lineId, qty: 1 }] }));
    const r = await refunds.refund(
      refundCmd(order.id, { idempotencyKey: "r-2", items: [{ lineId: a.lineId, qty: 1 }, { lineId: b.lineId, qty: 1 }] }),
    );
    expect(r.ok && r.refund.kind).toBe("full");
    expect(db.orders[0].status).toBe("refunded");
    expect(db.refunds.reduce((s, x) => s + x.amountRp, 0)).toBe(27_500);
    expect(sum(db, "milk", "return_in")).toBe(sum(db, "milk", "sale_consumption"));
  });

  it("void mengubah status order dan pembayaran, mengembalikan seluruh stok", async () => {
    const { db, refunds, order } = await placed();
    const r = await refunds.refund(refundCmd(order.id, { kind: "void" }));
    expect(r.ok && r.refund).toMatchObject({ kind: "void", amountRp: 27_500, resultStatus: "voided" });
    expect(db.orders[0].status).toBe("voided");
    expect(db.payments.every((p) => p.status === "voided")).toBe(true);
    expect(sum(db, "beans", "return_in")).toBe(54_000);
  });

  it("menolak jumlah berlebih dengan batas per baris, tanpa mengubah data", async () => {
    const { db, refunds, order } = await placed();
    const before = structuredClone(db.orders);
    const r = await refunds.refund(refundCmd(order.id, { items: [{ lineId: order.lines[0].lineId, qty: 3 }] }));
    expect(r).toMatchObject({ ok: false, code: "invalid", maxPerLine: { [order.lines[0].lineId]: 2 } });
    expect(db.orders).toEqual(before);
    expect(db.refunds).toEqual([]);
  });

  it("menolak order voided/refunded dan void pada partially_refunded dengan menyebut status", async () => {
    const { refunds, order } = await placed();
    await refunds.refund(refundCmd(order.id, { kind: "void" }));
    const again = await refunds.refund(refundCmd(order.id, { idempotencyKey: "r-2", items: [{ lineId: order.lines[0].lineId, qty: 1 }] }));
    expect(again).toMatchObject({ ok: false, message: expect.stringContaining("voided") });
    const second = await placed();
    await second.refunds.refund(refundCmd(second.order.id, { items: [{ lineId: second.order.lines[0].lineId, qty: 1 }] }));
    const voidAfter = await second.refunds.refund(refundCmd(second.order.id, { idempotencyKey: "r-2", kind: "void" }));
    expect(voidAfter).toMatchObject({ ok: false, message: expect.stringContaining("partially_refunded") });
  });

  it("kasir tanpa approver ditolak; dengan approver supervisor diterima dan tercatat", async () => {
    const { db, refunds, order } = await placed();
    const items = [{ lineId: order.lines[0].lineId, qty: 1 }];
    const cashier = { id: "u-k", role: "kasir" } as const;
    expect(await refunds.refund(refundCmd(order.id, { items, actor: cashier }))).toMatchObject({ ok: false, code: "forbidden" });
    expect(await refunds.refund(refundCmd(order.id, { items, actor: cashier, approver: { id: "u-k2", role: "kasir" } }))).toMatchObject({ code: "forbidden" });
    expect(db.refunds).toEqual([]);
    const ok = await refunds.refund(refundCmd(order.id, { items, actor: cashier, approver: { id: "u-sup", role: "supervisor" } }));
    expect(ok.ok).toBe(true);
    expect(db.audit[0]).toMatchObject({ actorId: "u-k", approverId: "u-sup" });
  });

  it("alasan kosong atau terlalu panjang ditolak", async () => {
    const { refunds, order } = await placed();
    const items = [{ lineId: order.lines[0].lineId, qty: 1 }];
    expect(await refunds.refund(refundCmd(order.id, { items, reason: "   " }))).toMatchObject({ ok: false, code: "invalid" });
    expect(await refunds.refund(refundCmd(order.id, { items, reason: "x".repeat(201) }))).toMatchObject({ ok: false, code: "invalid" });
  });

  it.each(["stock", "audit", "outbox", "refunds"] as const)("kegagalan %s membatalkan seluruh refund", async (flag) => {
    const { db, refunds, order } = await placed();
    const before = structuredClone({ o: db.orders, m: db.movements, p: db.payments, a: db.audit });
    db.fail[flag] = true;
    const r = await refunds.refund(refundCmd(order.id, { kind: "void" }));
    expect(r).toMatchObject({ ok: false, code: "failed" });
    expect({ o: db.orders, m: db.movements, p: db.payments, a: db.audit }).toEqual(before);
    expect(db.refunds).toEqual([]);
  });

  it("guard refunded_qty yang mengubah 0 baris membatalkan seluruh refund", async () => {
    const { db, refunds, order } = await placed();
    const before = structuredClone({ o: db.orders, m: db.movements, p: db.payments, a: db.audit });
    db.fail.zeroRows = true;
    const r = await refunds.refund(refundCmd(order.id, { items: [{ lineId: order.lines[0].lineId, qty: 1 }] }));
    expect(r).toMatchObject({ ok: false, code: "failed" });
    expect({ o: db.orders, m: db.movements, p: db.payments, a: db.audit }).toEqual(before);
    expect(db.refunds).toEqual([]);
  });
  it("store memory melaporkan 0 baris bila refunded_qty melebihi qty", async () => {
    const { db, order } = await placed();
    const line = order.lines[0];
    await db.uow.transact(async (tx) => {
      expect(await tx.orders.addRefundedQty(order.id, line.lineId, line.qty + 1)).toBe(0);
      expect(await tx.orders.addRefundedQty(order.id, line.lineId, line.qty)).toBe(1);
      expect(await tx.orders.addRefundedQty(order.id, line.lineId, 1)).toBe(0);
    });
  });
  it("order tidak ditemukan dan metode tidak dikenal ditolak", async () => {
    const { refunds, order } = await placed();
    expect(await refunds.refund(refundCmd("nope", { kind: "void" }))).toMatchObject({ ok: false, code: "invalid" });
    const bad = refundCmd(order.id, { kind: "void", method: "bitcoin" as never });
    expect(await refunds.refund(bad)).toMatchObject({ ok: false, code: "invalid" });
  });
});
