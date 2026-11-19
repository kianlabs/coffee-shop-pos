// Feature: open-source-pos-upgrade, Property 7: Refund idempotency
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { RefundCommand } from "@/services/refundTypes";
import { command, line, setup } from "./support/orderFixtures";

const sup = { id: "u-sup", role: "supervisor" } as const;

async function seeded(qtys: number[]) {
  const s = setup();
  const lines = qtys.map((q, i) => line(`l${i}`, q, 3_333));
  const total = lines.reduce((t, l) => t + l.qty * l.unitPriceRp, 0);
  const r = await s.checkout.checkout(command({ lines, payments: [{ method: "cash", amountRp: total }] }));
  if (!r.ok) throw new Error(r.message);
  return { ...s, order: r.order };
}

const snap = (db: Awaited<ReturnType<typeof seeded>>["db"]) =>
  structuredClone({ o: db.orders, p: db.payments, m: db.movements, r: db.refunds, a: db.audit, x: db.outbox });

describe("Property 7: Refund idempotency", () => {
  it("n pengiriman refund atau void dengan kunci sama menyimpan satu refund, satu set movement, satu audit", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 3 }),
        fc.boolean(),
        fc.integer({ min: 2, max: 4 }),
        fc.nat(),
        async (qtys, isVoid, n, pick) => {
          const { db, refunds, order } = await seeded(qtys);
          const target = order.lines[pick % order.lines.length];
          const cmd: RefundCommand = {
            idempotencyKey: "k",
            orderId: order.id,
            kind: isVoid ? "void" : "refund",
            items: [{ lineId: target.lineId, qty: 1 + (pick % target.qty) }],
            reason: "uji",
            method: "cash",
            actor: sup,
          };
          const first = await refunds.refund(cmd);
          expect(first.ok).toBe(true);
          const after = snap(db);
          for (let i = 1; i < n; i++) {
            const again = await refunds.refund(cmd);
            expect(again.ok && first.ok && again.refund).toEqual(first.ok ? first.refund : null);
          }
          expect(snap(db)).toEqual(after);
          expect(db.refunds).toHaveLength(1);
          expect(db.audit).toHaveLength(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("order voided atau refunded menolak permintaan baru tanpa mengubah state", async () => {
    const { db, refunds, order } = await seeded([2]);
    await refunds.refund({ idempotencyKey: "a", orderId: order.id, kind: "refund", items: [{ lineId: order.lines[0].lineId, qty: 2 }], reason: "x", method: "cash", actor: sup });
    const after = snap(db);
    for (const kind of ["refund", "void"] as const) {
      const r = await refunds.refund({ idempotencyKey: `b-${kind}`, orderId: order.id, kind, items: [{ lineId: order.lines[0].lineId, qty: 1 }], reason: "x", method: "cash", actor: sup });
      expect(r.ok).toBe(false);
    }
    expect(snap(db)).toEqual(after);
  });

  it("pengiriman serentak dengan kunci sama menyimpan satu refund", async () => {
    const { db, refunds, order } = await seeded([2]);
    const cmd: RefundCommand = { idempotencyKey: "c", orderId: order.id, kind: "void", reason: "x", method: "cash", actor: sup };
    await Promise.all([refunds.refund(cmd), refunds.refund(cmd), refunds.refund(cmd)]);
    expect(db.refunds).toHaveLength(1);
    expect(db.audit).toHaveLength(1);
  });
});
