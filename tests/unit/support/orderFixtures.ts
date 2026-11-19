import type { CheckoutCommand, CheckoutLineInput } from "@/services/checkoutTypes";
import type { OrderUnitOfWork } from "@/services/ports/orders";
import type { RefundCommand } from "@/services/refundTypes";
import { CheckoutService } from "@/services/checkoutService";
import { RefundService } from "@/services/refundService";
import { fixedClock, sequentialIds } from "@/testing/memory/settings";
import { createMemoryOrderDb } from "@/testing/memory/orders";

export function line(key: string, qty = 1, price = 10_000): CheckoutLineInput {
  return {
    key,
    productId: `p-${key}`,
    name: key,
    qty,
    unitPriceRp: price,
    adjustmentsRp: 0,
    hppRp: 4_000,
    modifiers: [],
    consumptionPerUnit: [
      { ingredientId: "beans", qtyMilli: 18_000 },
      { ingredientId: "milk", qtyMilli: 150_000 },
    ],
  };
}

export function command(overrides: Partial<CheckoutCommand> = {}): CheckoutCommand {
  return {
    idempotencyKey: "key-1",
    userId: "u-1",
    lines: [line("a", 2), line("b", 1, 7_500)],
    payments: [{ method: "cash", amountRp: 30_000 }],
    tax: { taxMode: "off", taxRateBp: 0, taxBase: "after_discount", serviceEnabled: false, serviceRateBp: 0, roundingStep: 0 },
    paymentConfig: { maxPerOrder: 10 },
    ...overrides,
  };
}

export function servicesFor(uow: OrderUnitOfWork) {
  const deps = { uow, clock: fixedClock(), ids: sequentialIds("id") };
  return { checkout: new CheckoutService(deps), refunds: new RefundService(deps), deps };
}
export function setup() {
  const db = createMemoryOrderDb();
  return { db, ...servicesFor(db.uow) };
}
export function refundCmd(orderId: string, overrides: Partial<RefundCommand> = {}): RefundCommand {
  return {
    idempotencyKey: "r-1",
    orderId,
    kind: "refund",
    reason: "  Salah pesan  ",
    method: "cash",
    actor: { id: "u-sup", role: "supervisor" },
    ...overrides,
  };
}
