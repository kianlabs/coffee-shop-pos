import { afterEach, describe, expect, it } from "vitest";
import { MIGRATION_STEPS, CORE_MIGRATION_VERSIONS } from "@/data/migration/steps";
import { validateChain } from "@/domain/migration";
import { validateModules } from "@/domain/modules/dependencies";
import fnb from "@/modules/fnb/module";
import pelanggan from "@/modules/pelanggan/module";
import { openSqlJsDb } from "@/testing/sqlJsDb";
import { fkViolations, migrate, openAt, userVersion, type Db } from "./support/migrationHarness";
let db: Db;
afterEach(() => db?.close());
const names = async (d: Db) =>
  (await d.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map((r) => r.name);
const count = async (d: Db, table: string) => (await d.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0].n;
const DATA_TABLES = ["products", "ingredients", "users", "shifts", "orders", "order_items", "payments"];

async function seed(d: Db): Promise<void> {
  const at = "2026-01-01T00:00:00Z";
  await d.run("INSERT INTO categories (id, name, created_at, updated_at) VALUES ('c1', 'Kopi', ?, ?)", [at, at]);
  await d.run("INSERT INTO products (id, category_id, name, base_price_rp, created_at, updated_at) VALUES ('p1', 'c1', 'Latte', 25000, ?, ?)", [at, at]);
  await d.run("INSERT INTO ingredients (id, name, base_unit, stock_milli, created_at) VALUES ('i1', 'Susu', 'l', 1000, ?)", [at]);
  await d.run(
    "INSERT INTO users (id, display_name, display_name_ci, role, pin_hash, created_at, updated_at) VALUES ('u1', 'Owner', 'owner', 'owner', 'h', ?, ?)",
    [at, at],
  );
  await d.run("INSERT INTO shifts (id, opened_by, status, opening_cash_rp, opened_at) VALUES ('s1', 'u1', 'terbuka', 100000, ?)", [at]);
  for (const [id, cust] of [["o1", null], ["o2", "ghost-customer"]] as const) {
    await d.run(
      `INSERT INTO orders (id, receipt_number, idempotency_key, status, subtotal_rp, total_rp, created_at, updated_at, user_id, shift_id, customer_id, customer_name)
       VALUES (?, ?, ?, 'completed', 25000, 25000, ?, ?, 'u1', 's1', ?, 'Budi')`,
      [id, `R-${id}`, `k-${id}`, at, at, cust],
    );
    await d.run(
      `INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, quantity, unit_price_rp, line_total_rp, created_at)
       VALUES (?, ?, 'p1', 'Latte', 1, 25000, 25000, ?)`,
      [`oi-${id}`, id, at],
    );
    await d.run("INSERT INTO payments (id, order_id, method, amount_rp, status, created_at) VALUES (?, ?, 'cash', 25000, 'paid', ?)", [`pay-${id}`, id, at]);
  }
}

describe("migrasi V15 sampai V18", () => {
  it("rantai penuh valid dan modul tidak bentrok dengan versi inti", () => {
    expect(validateChain(MIGRATION_STEPS)).toBeNull();
    expect(CORE_MIGRATION_VERSIONS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 18]);
    expect(validateModules([fnb, pelanggan], CORE_MIGRATION_VERSIONS)).toEqual({ ok: true, order: ["fnb", "pelanggan"] });
  });

  it("langkah modul sama dengan daftar langkah penuh", () => {
    const byVersion = new Map(MIGRATION_STEPS.map((s) => [s.version, s]));
    expect(fnb.migrations.map((s) => s.version)).toEqual([15, 17]);
    expect(pelanggan.migrations.map((s) => s.version)).toEqual([16]);
    for (const step of [...fnb.migrations, ...pelanggan.migrations]) expect(byVersion.get(step.version)).toEqual(step);
  });

  it("database baru sampai V18: FK menyala, tidak ada pelanggaran, tabel modul ada", async () => {
    db = await openSqlJsDb();
    await db.exec("PRAGMA foreign_keys = ON");
    expect(await migrate(db)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(await userVersion(db)).toBe(18);
    expect(await fkViolations(db)).toEqual([]);
    const tables = await names(db);
    for (const t of ["modifier_groups", "modifiers", "order_queue", "product_photos", "customers", "promos", "vouchers", "open_bills", "bill_splits", "queue_counters", "expenses"]) {
      expect(tables).toContain(t);
    }
    expect(await db.query("SELECT id, is_anonymous FROM customers")).toEqual([{ id: "customer-anonymous", is_anonymous: 1 }]);
    const idx = await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%_status' OR name = 'idx_payments_method_order'");
    expect(idx.length).toBeGreaterThanOrEqual(2);
  });

  it("V14 berdata naik ke V18 tanpa kehilangan baris; pelanggan tak dikenal jadi NULL", async () => {
    db = await openAt(14);
    await db.exec("PRAGMA foreign_keys = ON");
    await seed(db);
    const before: Record<string, number> = {};
    for (const t of DATA_TABLES) before[t] = await count(db, t);
    const orderRows = await db.query("SELECT id, receipt_number, total_rp, customer_name FROM orders ORDER BY id");
    expect(await migrate(db)).toEqual([15, 16, 17, 18]);
    for (const t of DATA_TABLES) expect(await count(db, t)).toBe(before[t]);
    expect(await db.query("SELECT id, receipt_number, total_rp, customer_name FROM orders ORDER BY id")).toEqual(orderRows);
    expect(await db.query("SELECT id, customer_id FROM orders ORDER BY id")).toEqual([
      { id: "o1", customer_id: null },
      { id: "o2", customer_id: null },
    ]);
    expect(await db.query("SELECT sort_order, is_sold_out FROM products")).toEqual([{ sort_order: 0, is_sold_out: 0 }]);
    expect(await fkViolations(db)).toEqual([]);
    expect(await db.query("PRAGMA integrity_check")).toEqual([{ integrity_check: "ok" }]);
    // The FK now rejects an unknown customer.
    await expect(db.run("UPDATE orders SET customer_id = 'nope' WHERE id = 'o1'")).rejects.toThrow();
    // Child tables still reference the rebuilt orders table.
    await db.run("INSERT INTO order_queue (order_id, status, updated_at) VALUES ('o1', 'baru', 'x')");
    await expect(db.run("INSERT INTO order_queue (order_id, status, updated_at) VALUES ('zz', 'baru', 'x')")).rejects.toThrow();
  });

  it("dijalankan ulang tidak mengubah apa pun", async () => {
    db = await openAt(14);
    await db.exec("PRAGMA foreign_keys = ON");
    await seed(db);
    await migrate(db);
    const schema = await db.query("SELECT name, sql FROM sqlite_master ORDER BY name");
    const orders = await db.query("SELECT * FROM orders ORDER BY id");
    expect(await migrate(db)).toEqual([]);
    expect(await db.query("SELECT name, sql FROM sqlite_master ORDER BY name")).toEqual(schema);
    expect(await db.query("SELECT * FROM orders ORDER BY id")).toEqual(orders);
    expect(await count(db, "schema_migrations")).toBe(18);
  });
});
