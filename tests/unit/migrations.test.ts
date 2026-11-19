import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7 } from "@/data/migrations";
import { openSqlJsDb } from "@/testing/sqlJsDb";

type Db = Awaited<ReturnType<typeof openSqlJsDb>>;

describe("migrasi V1..V7 pada SQLite kosong", () => {
  let db: Db;

  beforeEach(async () => {
    db = await openSqlJsDb();
  });

  afterEach(() => db.close());

  it("menghasilkan tabel inti setelah semua versi dijalankan berurutan", async () => {
    for (const batch of [UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7]) {
      for (const stmt of batch) {
        await db.exec(stmt);
      }
    }
    const rows = await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    const names = rows.map((r) => r.name);
    for (const expected of ["orders", "order_items", "payments", "stock_movements", "app_settings"]) {
      expect(names).toContain(expected);
    }
  });

  it("query dengan parameter mengembalikan baris sebagai objek", async () => {
    await db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, nama TEXT)");
    await db.exec("INSERT INTO t (nama) VALUES ('kopi'), ('teh')");
    const rows = await db.query<{ id: number; nama: string }>("SELECT id, nama FROM t WHERE nama = ?", ["teh"]);
    expect(rows).toEqual([{ id: 2, nama: "teh" }]);
  });
});
