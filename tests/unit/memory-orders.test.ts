import { describe, expect, it } from "vitest";
import { createMemoryOrderDb } from "@/testing/memory/orders";
import type { RefundRecord, StockMovementRecord } from "@/services/ports/orders";
const movement = (id: string, over: Partial<StockMovementRecord> = {}): StockMovementRecord => ({
  id, ingredientId: "i1", type: "sale_consumption", qtyMilli: 5, referenceType: "order", referenceId: "o1", createdAt: "t", ...over,
});
const refund = (id: string, key: string): RefundRecord => ({
  id, idempotencyKey: key, orderId: "o1", kind: "full", amountRp: 1, method: "cash", reason: "x", userId: "u",
  approverId: "u", createdAt: "t", lines: [], resultStatus: "refunded",
});
describe("memory order store mirrors the SQL unique indexes", () => {
  it("rejects a duplicate refund idempotency key and rolls back", async () => {
    const db = createMemoryOrderDb();
    await db.uow.transact((tx) => tx.refunds.insert(refund("r1", "k")));
    await expect(db.uow.transact((tx) => tx.refunds.insert(refund("r2", "k")))).rejects.toThrow(/duplicate refund/);
    expect(db.refunds.map((r) => r.id)).toEqual(["r1"]);
  });
  it("rejects a duplicate (reference, type, ingredient) movement, across and within batches", async () => {
    const db = createMemoryOrderDb();
    await db.uow.transact((tx) => tx.stock.append([movement("m1")]));
    await expect(db.uow.transact((tx) => tx.stock.append([movement("m2")]))).rejects.toThrow(/duplicate stock/);
    await expect(db.uow.transact((tx) => tx.stock.append([movement("m3", { ingredientId: "i2" }), movement("m4", { ingredientId: "i2" })]))).rejects.toThrow(/duplicate stock/);
    expect(db.movements.map((m) => m.id)).toEqual(["m1"]);
    await db.uow.transact((tx) => tx.stock.append([movement("m5", { type: "return_in", referenceType: "order_void" })]));
    expect(db.movements).toHaveLength(2);
  });
});
