import { afterEach, describe, expect, it } from "vitest";
import { createLegacyCartShiftHook } from "@/data/migration/hooks/legacyCartShift";
import type { HookInputs, LegacyInputs } from "@/data/migration/hooks";
import { PLACEHOLDER_USER_ID } from "@/data/migration/hooks/migrationUser";
import { runMigrations } from "@/data/migration/runner";
import { MIGRATION_STEPS } from "@/data/migration/steps";
import { createMigrationHooks } from "@/data/migration/hooks";
import { NO_LEGACY, NOW, fkViolations, migrate, openAt, txFor, userVersion, type Db } from "./support/migrationHarness";
import { openSqlJsDb } from "@/testing/sqlJsDb";
const line = { productId: "p1", variantId: null, productName: "Kopi", variantName: null, unitPriceRp: 18000, qty: 2 };
const shift = { id: "shift-1", cashierName: "Ani", openedAt: "2025-12-31T01:00:00.000Z", closedAt: null, openCashRp: 100000 };
const held = (over: Record<string, unknown> = {}) => ({
  id: "h1", cart: [line], notes: "Meja 3", orderType: "take-away", discount: 0, tax: 0, total: 36000, heldAt: "2025-12-31T02:00:00.000Z", ...over,
});
const legacy = (over: Partial<LegacyInputs> = {}): LegacyInputs => ({
  ...NO_LEGACY, shift: JSON.stringify(shift), cart: JSON.stringify([line]), held: JSON.stringify([held(), held({ id: "h2", orderType: "dine-in", notes: "" })]), ...over,
});
let db: Db;
afterEach(() => db.close());
async function runHook(l: LegacyInputs, logs: string[] = []): Promise<Db> {
  db = await openAt(10);
  await db.exec("PRAGMA foreign_keys = ON");
  const inputs: HookInputs = { legacy: l, now: () => NOW, log: (m) => logs.push(m) };
  await createLegacyCartShiftHook(inputs, () => undefined)(db);
  return db;
}
describe("migrasi V10 shifts_carts_held", () => {
  it("fresh: tabel ada dan kosong", async () => {
    db = await openSqlJsDb();
    await migrate(db, NO_LEGACY, 10);
    for (const t of ["shifts", "cash_entries", "carts", "held_orders"]) expect(await db.query(`SELECT * FROM ${t}`)).toEqual([]);
    expect(await db.query("SELECT id FROM users")).toEqual([]);
  });
  it("memindahkan shift, cart, dan pesanan ditahan dengan tipe order baru", async () => {
    await runHook(legacy());
    expect(await db.query("SELECT id, opened_by, opening_cash_rp, status FROM shifts")).toEqual([
      { id: "shift-1", opened_by: PLACEHOLDER_USER_ID, opening_cash_rp: 100000, status: "terbuka" },
    ]);
    const carts = await db.query<{ payload_json: string }>("SELECT payload_json FROM carts");
    expect(JSON.parse(carts[0].payload_json)).toEqual({ lines: [line] });
    const heldRows = await db.query<{ id: string; label: string; payload_json: string; held_at: string }>("SELECT * FROM held_orders ORDER BY id");
    expect(heldRows.map((r) => r.label).sort()).toEqual(["Meja 3", "Pesanan 2"]);
    const types = heldRows.map((r) => (JSON.parse(r.payload_json) as { orderType: string }).orderType).sort();
    expect(types).toEqual(["dine_in", "takeaway"]);
    expect(heldRows.every((r) => r.id.startsWith("legacy-held-"))).toBe(true);
    expect(await fkViolations(db)).toEqual([]);
  });
  it("memakai owner yang ada alih-alih pengguna pengganti", async () => {
    db = await openSqlJsDb();
    await migrate(db, { ...NO_LEGACY, settings: JSON.stringify({ voidPinHash: "A".repeat(43) + "=", voidPinSalt: "B".repeat(22) + "==" }), shift: JSON.stringify(shift) }, 10);
    expect(await db.query("SELECT opened_by FROM shifts")).toEqual([{ opened_by: "user-owner-legacy" }]);
    expect(await db.query("SELECT id FROM users WHERE id = ?", [PLACEHOLDER_USER_ID])).toEqual([]);
  });
  it("shift yang sudah ditutup diimpor sebagai ditutup", async () => {
    await runHook(legacy({ shift: JSON.stringify({ ...shift, closedAt: "2025-12-31T09:00:00.000Z" }) }));
    expect(await db.query("SELECT status, closed_by, closed_at FROM shifts")).toEqual([
      { status: "ditutup", closed_by: PLACEHOLDER_USER_ID, closed_at: "2025-12-31T09:00:00.000Z" },
    ]);
  });
  it("entri rusak dilewati dan dicatat, entri baik tetap masuk", async () => {
    const logs: string[] = [];
    await runHook(legacy({ shift: "{rusak", cart: JSON.stringify([line, { productId: "" }, 7]), held: JSON.stringify([held(), { id: "x" }, held({ orderType: "gojek" }), null]) }), logs);
    expect(await db.query("SELECT id FROM shifts")).toEqual([]);
    const carts = await db.query<{ payload_json: string }>("SELECT payload_json FROM carts");
    expect((JSON.parse(carts[0].payload_json) as { lines: unknown[] }).lines).toHaveLength(1);
    expect(await db.query("SELECT id FROM held_orders")).toHaveLength(1);
    expect(logs.length).toBeGreaterThanOrEqual(5);
  });
  it("tanpa data lama tidak membuat apa pun, termasuk pengguna pengganti", async () => {
    await runHook(NO_LEGACY);
    expect(await db.query("SELECT id FROM users")).toEqual([]);
  });
  it("dijalankan dua kali tidak menggandakan baris", async () => {
    await runHook(legacy());
    const inputs: HookInputs = { legacy: legacy(), now: () => NOW };
    await createLegacyCartShiftHook(inputs, () => undefined)(db);
    for (const [t, n] of [["shifts", 1], ["carts", 1], ["held_orders", 2], ["users", 1]] as const) {
      expect(await db.query(`SELECT 1 FROM ${t}`)).toHaveLength(n);
    }
  });
  it("kunci lama dihapus hanya setelah semua versi commit", async () => {
    db = await openSqlJsDb();
    const cleared: string[] = [];
    await migrate(db, legacy(), 10, (k) => cleared.push(k));
    expect(cleared.sort()).toEqual(["cart", "held", "shift"]);
  });
  it("hook gagal membatalkan versi 10 dan tidak menghapus kunci lama", async () => {
    db = await openSqlJsDb();
    const cleared: string[] = [];
    const { hooks, afterCommit } = createMigrationHooks({ legacy: legacy(), now: () => NOW, clear: (k) => cleared.push(k) });
    const real = hooks.legacy_cart_shift_held;
    hooks.legacy_cart_shift_held = async (tx) => {
      await real(tx);
      throw new Error("gagal setelah menulis");
    };
    await expect(
      runMigrations({ db, transaction: txFor(db), steps: MIGRATION_STEPS, latest: 10, hooks, afterCommit }),
    ).rejects.toThrow("gagal setelah menulis");
    expect(await userVersion(db)).toBe(9);
    expect(await db.query("SELECT name FROM sqlite_master WHERE name = 'shifts'")).toEqual([]);
    expect(cleared).toEqual([]);
  });
});
