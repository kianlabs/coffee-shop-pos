import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Backend } from "./support/orderBackends";
import { sqlBackend } from "./support/orderBackends";
import { command, line, refundCmd } from "./support/orderFixtures";
import type { CheckoutExtension } from "@/services/ports/orders";
import { CheckoutService } from "@/services/checkoutService";
let b: Backend;
beforeEach(async () => {
  b = await sqlBackend();
});
afterEach(async () => {
  expect(await b.fkViolations()).toEqual([]);
  b.close();
});
async function placed() {
  const r = await b.checkout.checkout(command());
  if (!r.ok) throw new Error(r.message);
  return r.order;
}
describe("SQL order adapter", () => {
  it("round-trips an order with modifiers and milli consumption", async () => {
    const modLine = { ...line("c", 2, 12_000), adjustmentsRp: 2_000, modifiers: [{ modifierId: "m1", name: "Oat", priceDeltaRp: 2_000 }] };
    const r = await b.checkout.checkout(command({ lines: [modLine], payments: [{ method: "cash", amountRp: 30_000 }] }));
    if (!r.ok) throw new Error(r.message);
    const loaded = await b.uow.transact((tx) => tx.orders.get(r.order.id));
    expect(loaded).toEqual(r.order);
    expect(loaded?.lines[0].consumption).toEqual([
      { ingredientId: "beans", qtyMilli: 36_000 },
      { ingredientId: "milk", qtyMilli: 300_000 },
    ]);
  });
  it("addRefundedQty is guarded and returns the changed row count", async () => {
    const o = await placed();
    const lineId = o.lines[0].lineId;
    await b.uow.transact(async (tx) => {
      expect(await tx.orders.addRefundedQty(o.id, lineId, o.lines[0].qty + 1)).toBe(0);
      expect(await tx.orders.addRefundedQty(o.id, lineId, 1)).toBe(1);
      expect(await tx.orders.addRefundedQty(o.id, lineId, 1)).toBe(1);
      expect(await tx.orders.addRefundedQty(o.id, lineId, 1)).toBe(0);
      expect(await tx.orders.addRefundedQty(o.id, "missing", 1)).toBe(0);
      expect(await tx.orders.addRefundedQty("other-order", lineId, 1)).toBe(0);
    });
  });
  it("two overlapping transactions cannot refund more than the quantity", async () => {
    const o = await placed();
    const lineId = o.lines[0].lineId;
    const take = () => b.uow.transact((tx) => tx.orders.addRefundedQty(o.id, lineId, 2));
    expect((await Promise.all([take(), take()])).sort()).toEqual([0, 1]);
  });
  it("the schema rejects a duplicate idempotency key and the adapter reports it like memory", async () => {
    const o = await placed();
    const copy = { ...o, id: "other" };
    await expect(b.uow.transact((tx) => tx.orders.insert(copy))).rejects.toThrow(/duplicate idempotency key/);
    expect((await b.snapshot()).orders).toHaveLength(1);
  });
  it("the schema rejects a duplicate stock reference and a duplicate refund key", async () => {
    const o = await placed();
    const dup = { id: "m-x", ingredientId: "beans", type: "sale_consumption", qtyMilli: 1, referenceType: "order", referenceId: o.id, createdAt: "t" } as const;
    await expect(b.uow.transact((tx) => tx.stock.append([dup]))).rejects.toThrow(/duplicate stock movement/);
    const r = await b.refunds.refund(refundCmd(o.id, { kind: "void" }));
    if (!r.ok) throw new Error(r.message);
    await expect(b.uow.transact((tx) => tx.refunds.insert({ ...r.refund, id: "r-x" }))).rejects.toThrow(/duplicate refund idempotency key/);
    expect((await b.snapshot()).refunds).toHaveLength(1);
  });
  it("other constraint errors pass through (unknown ingredient violates the foreign key)", async () => {
    const o = await placed();
    const bad = { id: "m-y", ingredientId: "ghost", type: "waste", qtyMilli: 1, referenceType: "order", referenceId: o.id, createdAt: "t" } as const;
    await expect(b.uow.transact((tx) => tx.stock.append([bad]))).rejects.toThrow(/FOREIGN KEY/);
  });
  it("a failing step after the order insert leaves no partial order", async () => {
    b.fail("stock", true);
    const r = await b.checkout.checkout(command());
    expect(r).toMatchObject({ ok: false, code: "failed" });
    const s = await b.snapshot();
    expect([s.orders, s.lines, s.payments, s.movements, s.outbox].map((t) => t.length)).toEqual([0, 0, 0, 0, 0]);
  });
  it("extension writes roll back with the checkout and the connection stays usable", async () => {
    const ext: CheckoutExtension = {
      id: "x",
      apply: async (_c, tx) => {
        await tx.outbox.enqueue({ id: "e1", entityType: "order", entityId: "q", op: "create", createdAt: "t" });
        throw new Error("down");
      },
    };
    expect(await new CheckoutService({ ...b.deps, extensions: [ext] }).checkout(command())).toMatchObject({ code: "failed" });
    expect((await b.snapshot()).outbox).toEqual([]);
    expect(await b.checkout.checkout(command())).toMatchObject({ ok: true, replayed: false });
  });
  it("stores stock as integer milli units and money as integers", async () => {
    const o = await placed();
    const s = await b.snapshot();
    const milk = (s.movements as Array<{ ingredientId: string; qtyMilli: number }>).find((m) => m.ingredientId === "milk");
    expect(milk?.qtyMilli).toBe(450_000);
    expect(Number.isInteger(o.totalRp)).toBe(true);
  });
});
