import type { CheckoutExtension } from "@/services/ports/orders";
import { CheckoutService } from "@/services/checkoutService";
import type { Backend, FailStep } from "./orderBackends";
import { command, line, refundCmd } from "./orderFixtures";
/** A scenario drives services only and returns what the caller saw; the harness adds the table snapshot. */
export interface Scenario {
  name: string;
  run(b: Backend): Promise<unknown>;
}
async function placed(b: Backend, overrides: Parameters<typeof command>[0] = {}) {
  const r = await b.checkout.checkout(command(overrides));
  if (!r.ok) throw new Error(r.message);
  return r.order;
}
const failing = (step: FailStep): Scenario["run"] => async (b) => {
  const first = await b.checkout.checkout(command());
  b.fail(step, true);
  const failed = await b.checkout.checkout(command({ idempotencyKey: "key-2" }));
  b.fail(step, false);
  const retried = await b.checkout.checkout(command({ idempotencyKey: "key-2" }));
  return { first, failed, retried };
};
const refundFailing = (step: FailStep): Scenario["run"] => async (b) => {
  const order = await placed(b);
  b.fail(step, true);
  const failed = await b.refunds.refund(refundCmd(order.id, { kind: "void" }));
  b.fail(step, false);
  return { failed, retried: await b.refunds.refund(refundCmd(order.id, { kind: "void" })) };
};
const queueExt: CheckoutExtension = {
  id: "queue",
  apply: async (_ctx, tx) => {
    await tx.outbox.enqueue({ id: "x", entityType: "order", entityId: "q", op: "create", createdAt: "t" });
    throw new Error("queue down");
  },
};
export const SCENARIOS: Scenario[] = [
  { name: "checkout stores order, payment, stock and outbox", run: async (b) => b.checkout.checkout(command()) },
  {
    name: "same key replays the existing order",
    run: async (b) => [await b.checkout.checkout(command()), await b.checkout.checkout(command())],
  },
  {
    name: "overlapping checkouts with one key create one order",
    run: async (b) => Promise.all([b.checkout.checkout(command()), b.checkout.checkout(command()), b.checkout.checkout(command())]),
  },
  { name: "underpayment is rejected", run: async (b) => b.checkout.checkout(command({ payments: [{ method: "cash", amountRp: 1_000 }] })) },
  {
    name: "empty cart and zero quantity are rejected",
    run: async (b) => [await b.checkout.checkout(command({ lines: [] })), await b.checkout.checkout(command({ lines: [line("a", 0)] }))],
  },
  { name: "stock failure rolls checkout back", run: failing("stock") },
  { name: "outbox failure rolls checkout back", run: failing("outbox") },
  {
    name: "extension failure rolls back its own writes",
    run: async (b) => new CheckoutService({ ...b.deps, extensions: [queueExt] }).checkout(command()),
  },
  {
    name: "tax, service and rounding reach the order",
    run: async (b) => {
      const tax = { taxMode: "exclusive", taxRateBp: 1100, taxBase: "after_discount", serviceEnabled: true, serviceRateBp: 500, roundingStep: 100 } as const;
      return b.checkout.checkout(command({ tax, payments: [{ method: "qris_manual", amountRp: 40_000, reference: "ref-1" }] }));
    },
  },
  {
    name: "negative stock never blocks a sale",
    run: async (b) => b.checkout.checkout(command({ lines: [line("a", 1000, 10)], payments: [{ method: "cash", amountRp: 10_000 }] })),
  },
  {
    name: "split payment with modifiers",
    run: async (b) => {
      const modLine = { ...line("c", 2, 12_000), adjustmentsRp: 2_000, modifiers: [{ modifierId: "m1", name: "Oat", priceDeltaRp: 2_000 }, { modifierId: "m2", name: "Ice", priceDeltaRp: 0 }] };
      const payments = [{ method: "cash", amountRp: 20_000 }, { method: "card_edc", amountRp: 8_000 }] as const;
      return b.checkout.checkout(command({ lines: [modLine], payments: [...payments] }));
    },
  },
  {
    name: "partial refund returns proportional stock",
    run: async (b) => {
      const o = await placed(b);
      const refund = await b.refunds.refund(refundCmd(o.id, { items: [{ lineId: o.lines[0].lineId, qty: 1 }] }));
      return { refund, order: await b.uow.transact((tx) => tx.orders.get(o.id)) };
    },
  },
  {
    name: "two refunds complete the order",
    run: async (b) => {
      const o = await placed(b);
      const [a, c] = o.lines;
      const first = await b.refunds.refund(refundCmd(o.id, { items: [{ lineId: a.lineId, qty: 1 }] }));
      const second = await b.refunds.refund(refundCmd(o.id, { idempotencyKey: "r-2", items: [{ lineId: a.lineId, qty: 1 }, { lineId: c.lineId, qty: 1 }] }));
      return { first, second, list: await b.uow.transact((tx) => tx.refunds.listByOrder(o.id)) };
    },
  },
  {
    name: "void flips order and payments",
    run: async (b) => {
      const o = await placed(b);
      const r = await b.refunds.refund(refundCmd(o.id, { kind: "void" }));
      return { r, payments: await b.uow.transact((tx) => tx.payments.listByOrder(o.id)) };
    },
  },
  {
    name: "over-refund is rejected with per-line maximum",
    run: async (b) => {
      const o = await placed(b);
      return b.refunds.refund(refundCmd(o.id, { items: [{ lineId: o.lines[0].lineId, qty: 3 }] }));
    },
  },
  {
    name: "voided order cannot be refunded; partial order cannot be voided",
    run: async (b) => {
      const o = await placed(b);
      await b.refunds.refund(refundCmd(o.id, { kind: "void" }));
      const again = await b.refunds.refund(refundCmd(o.id, { idempotencyKey: "r-2", items: [{ lineId: o.lines[0].lineId, qty: 1 }] }));
      const o2 = await placed(b, { idempotencyKey: "key-2" });
      await b.refunds.refund(refundCmd(o2.id, { idempotencyKey: "r-3", items: [{ lineId: o2.lines[0].lineId, qty: 1 }] }));
      return { again, voidAfter: await b.refunds.refund(refundCmd(o2.id, { idempotencyKey: "r-4", kind: "void" })) };
    },
  },
  {
    name: "cashier needs a supervisor approver",
    run: async (b) => {
      const o = await placed(b);
      const items = [{ lineId: o.lines[0].lineId, qty: 1 }];
      const cashier = { id: "u-k", role: "kasir" } as const;
      return [
        await b.refunds.refund(refundCmd(o.id, { items, actor: cashier })),
        await b.refunds.refund(refundCmd(o.id, { items, actor: cashier, approver: { id: "u-k2", role: "kasir" } })),
        await b.refunds.refund(refundCmd(o.id, { items, actor: cashier, approver: { id: "u-sup", role: "supervisor" } })),
      ];
    },
  },
  {
    name: "reason and method are validated",
    run: async (b) => {
      const o = await placed(b);
      const items = [{ lineId: o.lines[0].lineId, qty: 1 }];
      return [
        await b.refunds.refund(refundCmd(o.id, { items, reason: "   " })),
        await b.refunds.refund(refundCmd(o.id, { items, reason: "x".repeat(201) })),
        await b.refunds.refund(refundCmd("nope", { kind: "void" })),
        await b.refunds.refund(refundCmd(o.id, { kind: "void", method: "bitcoin" as never })),
      ];
    },
  },
  {
    name: "same refund key replays without a second movement",
    run: async (b) => {
      const o = await placed(b);
      const cmd = refundCmd(o.id, { items: [{ lineId: o.lines[0].lineId, qty: 1 }] });
      return [await b.refunds.refund(cmd), await b.refunds.refund(cmd)];
    },
  },
  {
    name: "overlapping refunds beyond the quantity: only one wins",
    run: async (b) => {
      const o = await placed(b);
      const items = [{ lineId: o.lines[0].lineId, qty: 2 }];
      return Promise.all([
        b.refunds.refund(refundCmd(o.id, { idempotencyKey: "r-a", items })),
        b.refunds.refund(refundCmd(o.id, { idempotencyKey: "r-b", items })),
      ]);
    },
  },
  { name: "stock failure rolls refund back", run: refundFailing("stock") },
  { name: "audit failure rolls refund back", run: refundFailing("audit") },
  { name: "outbox failure rolls refund back", run: refundFailing("outbox") },
  { name: "refund insert failure rolls refund back", run: refundFailing("refunds") },
];
