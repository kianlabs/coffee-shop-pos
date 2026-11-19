import { afterEach, describe, expect, it } from "vitest";
import { NO_LEGACY, NOW, fkViolations, migrate, openAt, userVersion, type Db } from "./support/migrationHarness";
import { openV7WithData } from "./support/v7Fixture";
let db: Db;
afterEach(() => db.close());
const user = (id: string) =>
  db.run("INSERT INTO users (id, display_name, display_name_ci, role, pin_hash, created_at, updated_at) VALUES (?, ?, ?, 'owner', 'x', ?, ?)", [id, id, id, NOW, NOW]);
describe("migrasi V13 inventory_suppliers", () => {
  it("fresh: tabel ada dan kosong", async () => {
    db = await openAt(12);
    await migrate(db, NO_LEGACY, 13);
    for (const t of ["suppliers", "stock_purchases", "stocktakes", "stocktake_items"]) expect(await db.query(`SELECT 1 FROM ${t}`)).toEqual([]);
    expect(await userVersion(db)).toBe(13);
  });
  it("menegakkan keunikan nama, batas kuantitas, batas harga, dan hitungan fisik", async () => {
    db = await openV7WithData();
    await db.exec("PRAGMA foreign_keys = ON");
    await migrate(db, NO_LEGACY, 13);
    await user("u1");
    await db.run("INSERT INTO suppliers (id, name, name_ci, created_at) VALUES ('s1', 'Toko Jaya', 'toko jaya', ?)", [NOW]);
    await expect(db.run("INSERT INTO suppliers (id, name, name_ci, created_at) VALUES ('s2', 'TOKO JAYA', 'toko jaya', ?)", [NOW])).rejects.toThrow(/UNIQUE/);
    const buy = (id: string, qty: number, total: number) =>
      db.run("INSERT INTO stock_purchases (id, supplier_id, ingredient_id, qty_milli, total_rp, user_id, created_at) VALUES (?, 's1', 'i1', ?, ?, 'u1', ?)", [id, qty, total, NOW]);
    await buy("b1", 1500, 999_999_999);
    await expect(buy("b2", 0, 10)).rejects.toThrow();
    await expect(buy("b3", 1, 1_000_000_000)).rejects.toThrow();
    await db.run("INSERT INTO stocktakes (id, user_id, created_at) VALUES ('t1', 'u1', ?)", [NOW]);
    await db.run("INSERT INTO stocktake_items (stocktake_id, ingredient_id, system_milli, physical_milli) VALUES ('t1', 'i1', 7500, 7400)");
    await expect(db.run("INSERT INTO stocktake_items (stocktake_id, ingredient_id, system_milli, physical_milli) VALUES ('t1', 'i2', 2, -1)")).rejects.toThrow();
    expect(await fkViolations(db)).toEqual([]);
  });
  it("menolak pembelian untuk supplier atau bahan yang tidak ada", async () => {
    db = await openAt(12);
    await db.exec("PRAGMA foreign_keys = ON");
    await migrate(db, NO_LEGACY, 13);
    await user("u1");
    await expect(
      db.run("INSERT INTO stock_purchases (id, supplier_id, ingredient_id, qty_milli, total_rp, user_id, created_at) VALUES ('b', 'x', 'y', 1, 1, 'u1', ?)", [NOW]),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});
