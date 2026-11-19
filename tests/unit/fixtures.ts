import { createCompletedOrder, type CheckoutInput, type Order } from "@/domain/orders";

export function sampleCheckout(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    lines: [
      { productId: "p1", variantId: null, productName: "Espresso", variantName: null, unitPriceRp: 18000, qty: 2 },
      { productId: "p2", variantId: "v1", productName: "Latte", variantName: "Large", unitPriceRp: 25000, qty: 1 },
    ],
    payment: { method: "cash", amountRp: 100000, paidAt: "2026-11-19T10:00:00.000Z" },
    idempotencyKey: "key-1",
    ...overrides,
  };
}

export function sampleOrder(overrides: Partial<CheckoutInput> = {}, now = new Date("2026-11-19T10:00:00.000Z")): Order {
  return createCompletedOrder(sampleCheckout(overrides), now);
}
