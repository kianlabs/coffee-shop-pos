import { afterEach, describe, expect, it } from "vitest";
import { NO_LEGACY, fkViolations, migrate, userVersion, type Db } from "./support/migrationHarness";
import { V7_EXPECTED, openV7WithData } from "./support/v7Fixture";
const LEGACY = {
  settings: JSON.stringify({ voidPinHash: "A".repeat(43) + "=", voidPinSalt: "B".repeat(22) + "==" }),
  shift: JSON.stringify({ id: "shift-9", cashierName: "Ani", openedAt: "2025-12-31T01:00:00.000Z", closedAt: null, openCashRp: 50_000 }),
  cart: JSON.stringify([{ productId: "p1", variantId: null, productName: "Kopi", variantName: null, unitPriceRp: 18_000, qty: 1 }]),
  held: JSON.stringify([{ id: "h1", cart: [{ productId: "p1", variantId: null, productName: "Kopi", variantName: null, unitPriceRp: 18_000, qty: 2 }], notes: "", orderType: "take-away", discount: 0, tax: 0, total: 36_000, heldAt: "2025-12-31T02:00:00.000Z" }, "rusak"]),
};
let db: Db;
afterEach(() => db.close());
const count = async (t: string) => (await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`))[0].n;
describe("database V7 berisi data menuju V14", () => {
  it("semua baris selamat, nilai terkonversi, data lama berpindah", async () => {
    db = await openV7WithData();
    await db.exec("PRAGMA foreign_keys = ON");
    await db.run("INSERT INTO app_settings (key, value, updated_at) VALUES ('printer.alamat', '\"AA:BB\"', 't')");
    const before = { orders: await count("orders"), items: await count("order_items"), payments: await count("payments"), movements: await count("stock_movements"), ingredients: await count("ingredients") };
    expect(await migrate(db, LEGACY)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(await userVersion(db)).toBe(18);
    expect({ orders: await count("orders"), items: await count("order_items"), payments: await count("payments"), movements: await count("stock_movements"), ingredients: await count("ingredients") }).toEqual(before);
    const stock = await db.query<{ id: string; stock_milli: number }>("SELECT id, stock_milli FROM ingredients");
    expect(Object.fromEntries(stock.map((r) => [r.id, r.stock_milli]))).toEqual(V7_EXPECTED.stockMilli);
    expect((await db.query<{ t: number }>("SELECT SUM(total_rp) AS t FROM orders"))[0].t).toBe(V7_EXPECTED.revenueRp);
    expect(await db.query("SELECT id FROM payments WHERE status = 'voided'")).toEqual([{ id: "p3" }]);
    expect(await db.query("SELECT id, role FROM users")).toEqual([{ id: "user-owner-legacy", role: "owner" }]);
    expect(await db.query("SELECT id, opened_by, status FROM shifts")).toEqual([{ id: "shift-9", opened_by: "user-owner-legacy", status: "terbuka" }]);
    expect(await count("carts")).toBe(1);
    expect(await count("held_orders")).toBe(1);
    expect(await count("refunds")).toBe(1);
    expect(await count("printers")).toBe(1);
    expect(await fkViolations(db)).toEqual([]);
    expect(await db.query("PRAGMA integrity_check")).toEqual([{ integrity_check: "ok" }]);
  });
  it("dijalankan ulang tidak menambah apa pun", async () => {
    db = await openV7WithData();
    await migrate(db, LEGACY);
    const tables = ["users", "shifts", "carts", "held_orders", "refunds", "refund_items", "printers", "orders", "payments"];
    const counts = async () => Promise.all(tables.map(count));
    const first = await counts();
    expect(await migrate(db, LEGACY)).toEqual([]);
    expect(await counts()).toEqual(first);
  });
  it("tanpa data lama pun semua versi selesai", async () => {
    db = await openV7WithData();
    await migrate(db, NO_LEGACY);
    expect(await userVersion(db)).toBe(18);
    expect(await count("users")).toBe(1); // placeholder owner for the synthetic refund
  });
});
