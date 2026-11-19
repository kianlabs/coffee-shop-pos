import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { createLegacyCartShiftHook } from "@/data/migration/hooks/legacyCartShift";
import { NOW, fkViolations, openAt, type Db } from "./support/migrationHarness";
// Property 24: legacy data import is idempotent (Req 2.7, 2.11, 4.10).
const arbLine = fc.record({
  productId: fc.string({ minLength: 1, maxLength: 6 }), variantId: fc.constantFrom(null, "v1"),
  productName: fc.string({ minLength: 1, maxLength: 12 }), variantName: fc.constant(null),
  unitPriceRp: fc.integer({ min: 0, max: 500_000 }), qty: fc.integer({ min: 1, max: 20 }),
});
const arbHeld = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }), cart: fc.array(arbLine, { minLength: 1, maxLength: 4 }),
  notes: fc.string({ maxLength: 20 }), orderType: fc.constantFrom("dine-in", "take-away"),
  discount: fc.nat(10_000), tax: fc.nat(10_000), total: fc.nat(1_000_000), heldAt: fc.constant("2025-12-31T02:00:00.000Z"),
});
const arbJunk = fc.oneof(fc.constant(null), fc.integer(), fc.string(), fc.record({ id: fc.string() }), fc.record({ id: fc.string({ minLength: 1 }), cart: fc.constant("x") }));
const arbShift = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }), cashierName: fc.string({ maxLength: 8 }),
  openedAt: fc.constant("2025-12-31T01:00:00.000Z"), closedAt: fc.constantFrom(null, "2025-12-31T09:00:00.000Z"),
  openCashRp: fc.integer({ min: 0, max: 1_000_000 }),
});
const maybeText = (arb: fc.Arbitrary<unknown>) => fc.oneof(fc.constant(null), arb.map((v) => JSON.stringify(v)), fc.constant("{rusak"));
const arbLegacy = fc.record({
  settings: fc.constant(null), shift: maybeText(arbShift),
  cart: maybeText(fc.array(fc.oneof(arbLine, arbJunk), { maxLength: 4 })),
  held: maybeText(fc.array(fc.oneof(arbHeld, arbJunk), { maxLength: 4 })),
});
const TABLES = ["users", "shifts", "carts", "held_orders"];
const counts = async (db: Db) => Promise.all(TABLES.map(async (t) => (await db.query(`SELECT 1 FROM ${t}`)).length));
let open: Db | null = null;
afterEach(() => open?.close());
describe("Properti 24: impor data lama idempoten", () => {
  it("menjalankan hook dua kali menghasilkan baris yang sama dan FK valid", async () => {
    await fc.assert(
      fc.asyncProperty(arbLegacy, async (legacy) => {
        const db = await openAt(10);
        open = db;
        await db.exec("PRAGMA foreign_keys = ON");
        const hook = createLegacyCartShiftHook({ legacy, now: () => NOW }, () => undefined);
        await hook(db);
        const first = await counts(db);
        const rows = await db.query("SELECT id, payload_json FROM held_orders ORDER BY id");
        await hook(db);
        expect(await counts(db)).toEqual(first);
        expect(await db.query("SELECT id, payload_json FROM held_orders ORDER BY id")).toEqual(rows);
        expect(await fkViolations(db)).toEqual([]);
        db.close();
        open = null;
      }),
      { numRuns: 60 },
    );
  });
  it("tidak ada entri rusak yang masuk", async () => {
    const db = await openAt(10);
    open = db;
    await createLegacyCartShiftHook(
      { legacy: { settings: null, shift: "x", cart: JSON.stringify([{ qty: 0 }]), held: JSON.stringify([{ id: "a", cart: [] }]) }, now: () => NOW },
      () => undefined,
    )(db);
    expect(await counts(db)).toEqual([0, 0, 0, 0]);
  });
});
