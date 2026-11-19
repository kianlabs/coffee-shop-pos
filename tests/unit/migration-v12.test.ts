import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { allocateProportional } from "@/data/migration/hooks/chargeAllocation";
import { createMigrationHooks } from "@/data/migration/hooks";
import { createOrdersRefundsHook } from "@/data/migration/hooks/ordersRefunds";
import { PLACEHOLDER_USER_ID } from "@/data/migration/hooks/migrationUser";
import { runMigrations } from "@/data/migration/runner";
import { MIGRATION_STEPS } from "@/data/migration/steps";
import { NO_LEGACY, NOW, fkViolations, migrate, openAt, txFor, userVersion, type Db } from "./support/migrationHarness";
import { V7_EXPECTED, openV7WithData } from "./support/v7Fixture";
let db: Db;
afterEach(() => db.close());
const rows = <T extends Record<string, unknown>>(sql: string) => db.query<T>(sql);
const OWNER_SETTINGS = JSON.stringify({ voidPinHash: "A".repeat(43) + "=", voidPinSalt: "B".repeat(22) + "==" });
describe("migrasi V12 orders_payments_refunds", () => {
  it("fresh: tabel dan kolom baru ada", async () => {
    db = await openAt(11);
    await migrate(db, NO_LEGACY, 12);
    const cols = (await rows<{ name: string }>("PRAGMA table_info(payments)")).map((c) => c.name);
    expect(cols).toContain("split_id");
    for (const t of ["order_item_modifiers", "refunds", "refund_items"]) expect(await rows(`SELECT 1 FROM ${t}`)).toEqual([]);
  });
  it("semua pembayaran selamat termasuk yang voided, metode baru diterima", async () => {
    db = await openV7WithData();
    await db.exec("PRAGMA foreign_keys = ON");
    await migrate(db, NO_LEGACY, 12);
    const pays = await rows<{ id: string; status: string; method: string; amount_rp: number; split_id: string | null }>("SELECT * FROM payments ORDER BY id");
    expect(pays.map((p) => p.id)).toEqual(V7_EXPECTED.paymentIds);
    expect(pays.find((p) => p.id === "p3")).toMatchObject({ status: "voided", method: "cash", amount_rp: 18_000, split_id: null });
    for (const [i, method] of ["cash", "qris_manual", "card_edc", "bank_transfer", "other"].entries()) {
      await db.run("INSERT INTO payments (id, order_id, method, amount_rp, status, created_at) VALUES (?, 'o1', ?, 1, 'paid', 't')", [`n${i}`, method]);
    }
    await expect(db.run("INSERT INTO payments (id, order_id, method, amount_rp, status, created_at) VALUES ('bad', 'o1', 'ovo', 1, 'paid', 't')")).rejects.toThrow();
    expect(await fkViolations(db)).toEqual([]);
  });
  it("jumlah order per status dan omzet tidak berubah", async () => {
    db = await openV7WithData();
    await migrate(db, NO_LEGACY, 12);
    const byStatus = await rows<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM orders GROUP BY status");
    expect(Object.fromEntries(byStatus.map((r) => [r.status, r.n]))).toEqual(V7_EXPECTED.ordersByStatus);
    expect((await rows<{ t: number }>("SELECT SUM(total_rp) AS t FROM orders"))[0].t).toBe(V7_EXPECTED.revenueRp);
  });
  it("charge_total_rp tiap baris dialokasikan dari total order", async () => {
    db = await openV7WithData();
    await migrate(db, NO_LEGACY, 12);
    const items = await rows<{ id: string; charge_total_rp: number }>("SELECT id, charge_total_rp FROM order_items ORDER BY id");
    expect(Object.fromEntries(items.map((r) => [r.id, r.charge_total_rp]))).toEqual({ oi1: 36_000, oi2: 18_000, oi3: 27_000, oi4: 32_400, oi5: 21_600 });
  });
  it("order refunded lama mendapat satu refund sintetis oleh pengguna pengganti bila belum ada owner", async () => {
    db = await openV7WithData();
    await db.exec("PRAGMA foreign_keys = ON");
    await migrate(db, NO_LEGACY, 12);
    expect(await rows("SELECT id, order_id, kind, amount_rp, method, reason, executed_by, created_at FROM refunds")).toEqual([
      { id: "legacy-refund-o3", order_id: "o3", kind: "full", amount_rp: 27_000, method: "other", reason: "migrasi", executed_by: PLACEHOLDER_USER_ID, created_at: "2025-12-30T03:00:00.000Z" },
    ]);
    expect(await rows("SELECT refund_id, order_item_id, qty, amount_rp FROM refund_items")).toEqual([
      { refund_id: "legacy-refund-o3", order_item_id: "oi3", qty: 1, amount_rp: 27_000 },
    ]);
    expect(await rows("SELECT refunded_qty FROM order_items WHERE id = 'oi3'")).toEqual([{ refunded_qty: 1 }]);
    expect(await rows("SELECT DISTINCT user_id FROM orders")).toEqual([{ user_id: PLACEHOLDER_USER_ID }]);
    expect(await rows("SELECT id, is_active FROM users")).toEqual([{ id: PLACEHOLDER_USER_ID, is_active: 0 }]);
    expect(await fkViolations(db)).toEqual([]);
  });
  it("dengan owner hasil migrasi: user_id order dan executed_by memakai owner", async () => {
    db = await openV7WithData();
    await db.exec("PRAGMA foreign_keys = ON");
    await migrate(db, { ...NO_LEGACY, settings: OWNER_SETTINGS }, 12);
    expect(await rows("SELECT DISTINCT user_id FROM orders")).toEqual([{ user_id: "user-owner-legacy" }]);
    expect(await rows("SELECT executed_by FROM refunds")).toEqual([{ executed_by: "user-owner-legacy" }]);
    expect(await rows("SELECT id FROM users")).toHaveLength(1);
  });
  it("hook dijalankan ulang tidak menggandakan refund", async () => {
    db = await openV7WithData();
    await migrate(db, NO_LEGACY, 12);
    const before = await rows("SELECT * FROM order_items ORDER BY id");
    await createOrdersRefundsHook(() => NOW)(db);
    expect(await rows("SELECT id FROM refunds")).toHaveLength(1);
    expect(await rows("SELECT * FROM refund_items")).toHaveLength(1);
    expect(await rows("SELECT * FROM order_items ORDER BY id")).toEqual(before);
  });
  it("hook gagal membatalkan versi 12 saja: payments lama dan data utuh", async () => {
    db = await openV7WithData();
    await migrate(db, NO_LEGACY, 11);
    const { hooks } = createMigrationHooks({ legacy: NO_LEGACY, now: () => NOW });
    hooks.orders_refunds = async (tx) => {
      await tx.run("DELETE FROM payments");
      throw new Error("hook V12 gagal");
    };
    await expect(runMigrations({ db, transaction: txFor(db), steps: MIGRATION_STEPS, latest: 12, hooks })).rejects.toThrow("hook V12 gagal");
    expect(await userVersion(db)).toBe(11);
    expect(await rows("SELECT id FROM payments")).toHaveLength(5);
    expect(await rows("SELECT name FROM sqlite_master WHERE name = 'refunds'")).toEqual([]);
    await expect(db.run("INSERT INTO payments (id, order_id, method, amount_rp, status, created_at) VALUES ('z','o1','card_edc',1,'paid','t')")).rejects.toThrow();
  });
});
describe("allocateProportional", () => {
  it("jumlah bagian selalu sama dengan total dan tidak negatif", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 5_000_000 }), { maxLength: 8 }), fc.integer({ min: 0, max: 999_999_999 }), (weights, total) => {
        const shares = allocateProportional(weights, total);
        expect(shares).toHaveLength(weights.length);
        expect(shares.every((s) => s >= 0)).toBe(true);
        if (weights.length > 0) expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
      }),
    );
  });
  it("bobot nol memberi seluruh total ke baris pertama", () => {
    expect(allocateProportional([0, 0], 10)).toEqual([10, 0]);
    expect(allocateProportional([5, 5], 0)).toEqual([0, 0]);
    expect(allocateProportional([], 7)).toEqual([]);
  });
});
