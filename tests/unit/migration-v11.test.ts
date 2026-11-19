import { afterEach, describe, expect, it } from "vitest";
import { MigrationError } from "@/data/migration/runner";
import { NO_LEGACY, fkViolations, migrate, openAt, userVersion, type Db } from "./support/migrationHarness";
import { V7_EXPECTED, openV7WithData } from "./support/v7Fixture";
let db: Db;
afterEach(() => db.close());
const columns = async (table: string) => (await db.query<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name);
const count = async (table: string) => (await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0].n;
describe("migrasi V11 milli_stock", () => {
  it("fresh: kolom milli dan tabel konsumsi ada, kolom REAL hilang", async () => {
    db = await openAt(10);
    await migrate(db, NO_LEGACY, 11);
    expect(await columns("ingredients")).toEqual(["id", "name", "base_unit", "stock_milli", "min_stock_milli", "created_at"]);
    expect(await columns("stock_movements")).toContain("qty_milli");
    expect(await columns("stock_movements")).not.toContain("qty");
    expect(await columns("order_item_consumption")).toEqual(["order_item_id", "ingredient_id", "qty_milli"]);
  });
  it("V7 berisi data: semua baris selamat dan stok REAL menjadi milli", async () => {
    db = await openV7WithData();
    await db.exec("PRAGMA foreign_keys = ON");
    const before = { ing: await count("ingredients"), mov: await count("stock_movements"), orders: await count("orders") };
    expect(await migrate(db, NO_LEGACY, 11)).toEqual([8, 9, 10, 11]);
    expect(await count("ingredients")).toBe(before.ing);
    expect(await count("stock_movements")).toBe(before.mov);
    expect(await count("orders")).toBe(before.orders);
    const stock = await db.query<{ id: string; stock_milli: number }>("SELECT id, stock_milli FROM ingredients");
    expect(Object.fromEntries(stock.map((r) => [r.id, r.stock_milli]))).toEqual(V7_EXPECTED.stockMilli);
    const movs = await db.query<{ id: string; qty_milli: number }>("SELECT id, qty_milli FROM stock_movements");
    expect(Object.fromEntries(movs.map((r) => [r.id, r.qty_milli]))).toEqual(V7_EXPECTED.movementMilli);
    expect(await fkViolations(db)).toEqual([]);
    expect(await userVersion(db)).toBe(11);
  });
  it("saldo per bahan sama dengan jumlah movement bertanda", async () => {
    db = await openV7WithData();
    await migrate(db, NO_LEGACY, 11);
    const rows = await db.query<{ id: string; stock_milli: number; ledger: number }>(
      `SELECT i.id AS id, i.stock_milli AS stock_milli, SUM(CASE WHEN m.movement_type IN ('purchase_received','adjustment_in','return_in')
         THEN m.qty_milli ELSE -m.qty_milli END) AS ledger FROM ingredients i JOIN stock_movements m ON m.ingredient_id = i.id GROUP BY i.id`,
    );
    expect(rows.length).toBe(3);
    for (const r of rows) expect(r.stock_milli).toBe(r.ledger);
  });
  it("indeks dan tabel sementara: indeks unik tetap berlaku, tabel TEMP dibuang", async () => {
    db = await openV7WithData();
    await migrate(db, NO_LEGACY, 11);
    const insert = (id: string) => db.run(
      "INSERT INTO stock_movements (id, ingredient_id, qty_milli, movement_type, reference_type, reference_id, created_at) VALUES (?, 'i1', 5, 'sale_consumption', 'order', 'o1', 't')", [id],
    );
    await expect(insert("dup")).rejects.toThrow(/UNIQUE/);
    expect(await db.query("SELECT name FROM sqlite_temp_master")).toEqual([]);
  });
  it("ledger tidak cocok setelah konversi: versi 11 dibatalkan, data V10 utuh", async () => {
    db = await openAt(10);
    await db.run("INSERT INTO ingredients (id, name, base_unit, stock_qty, created_at) VALUES ('x','X','g',0.0006,'t')");
    for (const id of ["a", "b", "c"]) {
      await db.run("INSERT INTO stock_movements (id, ingredient_id, qty, movement_type, created_at) VALUES (?, 'x', 0.0002, 'purchase_received', 't')", [id]);
    }
    await expect(migrate(db, NO_LEGACY, 11)).rejects.toBeInstanceOf(MigrationError);
    expect(await userVersion(db)).toBe(10);
    expect(await columns("ingredients")).toContain("stock_qty");
    expect(await db.query("SELECT stock_qty FROM ingredients")).toEqual([{ stock_qty: 0.0006 }]);
    expect(await count("stock_movements")).toBe(3);
    expect(await db.query("SELECT version FROM schema_migrations WHERE version = 11")).toEqual([]);
  });
  it("ledger lama yang memang tidak seimbang dibawa apa adanya", async () => {
    db = await openAt(10);
    await db.run("INSERT INTO ingredients (id, name, base_unit, stock_qty, created_at) VALUES ('x','X','g',9,'t')");
    await db.run("INSERT INTO stock_movements (id, ingredient_id, qty, movement_type, created_at) VALUES ('a','x',1,'purchase_received','t')");
    await migrate(db, NO_LEGACY, 11);
    expect(await db.query("SELECT stock_milli FROM ingredients")).toEqual([{ stock_milli: 9000 }]);
  });
});
