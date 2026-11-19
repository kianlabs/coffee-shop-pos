// Feature: open-source-pos-upgrade, Property 4: Checkout idempotency
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CheckoutCommand } from "@/services/checkoutTypes";
import { command, line, setup } from "./support/orderFixtures";

const commandArb = fc
  .record({
    qtys: fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 4 }),
    price: fc.integer({ min: 500, max: 50_000 }),
    key: fc.string({ minLength: 1, maxLength: 12 }),
    extra: fc.integer({ min: 0, max: 20_000 }),
  })
  .map(({ qtys, price, key, extra }): CheckoutCommand => {
    const lines = qtys.map((q, i) => line(`l${i}`, q, price));
    const total = lines.reduce((s, l) => s + l.qty * l.unitPriceRp, 0);
    return command({ idempotencyKey: key, lines, payments: [{ method: "cash", amountRp: total + extra }] });
  });

describe("Property 4: Checkout idempotency", () => {
  it("n pengiriman dengan kunci sama menghasilkan state dan order yang sama dengan pengiriman pertama", async () => {
    await fc.assert(
      fc.asyncProperty(commandArb, fc.integer({ min: 2, max: 5 }), async (cmd, n) => {
        const { db, checkout } = setup();
        const first = await checkout.checkout(cmd);
        expect(first.ok).toBe(true);
        const after = structuredClone({ ...db, uow: undefined, fail: undefined });
        for (let i = 1; i < n; i++) {
          const again = await checkout.checkout(cmd);
          expect(again.ok && first.ok && again.order).toEqual(first.ok ? first.order : null);
        }
        expect(structuredClone({ ...db, uow: undefined, fail: undefined })).toEqual(after);
        expect(db.orders).toHaveLength(1);
        expect(db.outbox).toHaveLength(1);
      }),
      { numRuns: 100 },
    );
  });

  it("pengiriman serentak dengan kunci sama tetap menyimpan satu order", async () => {
    const { db, checkout } = setup();
    const results = await Promise.all([1, 2, 3].map(() => checkout.checkout(command())));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(db.orders).toHaveLength(1);
    expect(db.movements).toHaveLength(2);
  });
});
