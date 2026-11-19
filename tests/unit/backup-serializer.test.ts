import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackupRestoreError, exportBackup, exportTables, restoreIntoEmpty } from "@/data/backupSerializer";
import type { Transaction } from "@/data/migration/runner";
import { UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8 } from "@/data/migrations";
import { backupContentEqual, computeChecksum, type BackupDocument } from "@/domain/backup";
import { openSqlJsDb } from "@/testing/sqlJsDb";
type Db = Awaited<ReturnType<typeof openSqlJsDb>>;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const T = "2026-11-19T10:00:00.000Z";
const txFor = (db: Db): Transaction => async (fn) => {
  await db.exec("BEGIN");
  try {
    const result = await fn(db);
    await db.exec("COMMIT");
    return result;
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
};
async function migratedDb(): Promise<Db> {
  const db = await openSqlJsDb();
  for (const batch of [UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8]) {
    for (const s of batch) await db.exec(s);
  }
  await db.exec("PRAGMA user_version = 8");
  return db;
}
const SEED: Array<[string, Array<string | number | null>]> = [
  ["INSERT INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)", ["c1", "Kopi", T, T]],
  ["INSERT INTO products (id, category_id, name, base_price_rp, hpp_manual_rp, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", ["p1", "c1", "Kopi Susu", 18000, 6000, T, T]],
  ["INSERT INTO product_variants (id, product_id, name, price_delta_rp) VALUES (?, ?, ?, ?)", ["v1", "p1", "Large", 4000]],
  ["INSERT INTO ingredients (id, name, base_unit, stock_qty, created_at) VALUES (?, ?, ?, ?, ?)", ["i1", "Susu", "ml", 1250.5, T]],
  ["INSERT INTO stock_movements (id, ingredient_id, qty, movement_type, created_at) VALUES (?, ?, ?, ?, ?)", ["m1", "i1", 2000, "purchase_received", T]],
  ["INSERT INTO stock_movements (id, ingredient_id, qty, movement_type, reference_type, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", ["m2", "i1", -749.5, "sale_consumption", "order", "o1", T]],
  ["INSERT INTO orders (id, receipt_number, idempotency_key, status, subtotal_rp, total_rp, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ["o1", "R-001", "k1", "completed", 22000, 22000, "tanpa gula \"manis\"", T, T]],
  ["INSERT INTO order_items (id, order_id, product_id, variant_id, product_name_snapshot, quantity, unit_price_rp, line_total_rp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ["oi1", "o1", "p1", "v1", "Kopi Susu", 1, 22000, 22000, T]],
  ["INSERT INTO payments (id, order_id, method, amount_rp, status, created_at) VALUES (?, ?, ?, ?, ?, ?)", ["pay1", "o1", "cash", 22000, "paid", T]],
  ["INSERT INTO audit_logs (id, action, entity_type, entity_id, action_type, created_at) VALUES (?, ?, ?, ?, ?, ?)", ["a1", "checkout", "order", "o1", "sale", T]],
  ["INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)", ["toko.nama", "Suro", T, "owner"]],
  ["INSERT INTO modules (id, enabled) VALUES (?, ?)", ["fnb", 1]],
];
const restoreOpts = (db: Db) => ({ transaction: txFor(db), sha256, latestSchemaVersion: 8 });
const count = async (db: Db, table: string) => (await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0].n;
let source: Db;
let target: Db;
let doc: BackupDocument;
beforeEach(async () => {
  [source, target] = await Promise.all([migratedDb(), migratedDb()]);
  for (const [sql, params] of SEED) await source.run(sql, params);
  doc = await exportBackup(source, { createdAt: T, appVersion: "1.1.0", sha256 });
});
afterEach(() => {
  source.close();
  target.close();
});
describe("backupSerializer pada sql.js (V1..V8)", () => {
  it("mengekspor semua tabel dari sqlite_master kecuali internal", async () => {
    expect(doc.schemaVersion).toBe(8);
    expect(Object.keys(doc.tables)).toContain("modules");
    expect(Object.keys(doc.tables)).not.toContain("schema_migrations");
    expect(doc.tables.app_settings.columns).toEqual(["key", "value", "updated_at", "updated_by"]);
    expect(doc.tables.ingredients.rows[0]).toContain(1250.5);
  });
  it("round trip: ekspor, restore ke DB kosong, ekspor ulang menghasilkan isi yang sama", async () => {
    expect((await target.query<{ foreign_keys: number }>("PRAGMA foreign_keys"))[0].foreign_keys).toBe(1);
    await restoreIntoEmpty(target, doc, restoreOpts(target));
    const again = await exportBackup(target, { createdAt: "2026-11-20T00:00:00.000Z", appVersion: "1.1.0", sha256 });
    expect(backupContentEqual(doc, again)).toBe(true);
    expect(again.checksum).toBe(doc.checksum);
    await expect(target.exec("DELETE FROM audit_logs")).rejects.toThrow(/append-only/);
  });
  it("menolak checksum yang tidak cocok tanpa menulis satu baris pun", async () => {
    const tampered: BackupDocument = { ...doc, tables: { ...doc.tables, modules: { columns: ["id", "enabled", "enabled_at", "updated_by"], rows: [["fnb", 0, null, null]] } } };
    await expect(restoreIntoEmpty(target, tampered, restoreOpts(target))).rejects.toMatchObject({ reason: "checksum" });
    expect(await count(target, "modules")).toBe(0);
  });
  it("menolak backup dengan versi skema lebih baru", async () => {
    const newer = { ...doc, schemaVersion: 9 };
    await expect(restoreIntoEmpty(target, newer, restoreOpts(target))).rejects.toMatchObject({ reason: "newer-schema" });
  });
  it("menolak database tujuan yang tidak kosong dan tidak mengubahnya", async () => {
    await target.run("INSERT INTO modules (id, enabled) VALUES (?, ?)", ["lain", 0]);
    await expect(restoreIntoEmpty(target, doc, restoreOpts(target))).rejects.toBeInstanceOf(BackupRestoreError);
    expect(await count(target, "orders")).toBe(0);
    expect(await count(target, "modules")).toBe(1);
  });
  it("menolak tabel atau kolom yang tidak ada di database tujuan", async () => {
    const extraTable = { ...doc.tables, hilang: { columns: ["id"], rows: [["x"]] } };
    const d1 = { ...doc, tables: extraTable, checksum: await computeChecksum(extraTable, sha256) };
    await expect(restoreIntoEmpty(target, d1, restoreOpts(target))).rejects.toThrow(/Tabel hilang/);
    const extraCol = { ...doc.tables, modules: { columns: ["id", "x\"; DROP TABLE orders; --"], rows: [] } };
    const d2 = { ...doc, tables: extraCol, checksum: await computeChecksum(extraCol, sha256) };
    await expect(restoreIntoEmpty(target, d2, restoreOpts(target))).rejects.toThrow(/tidak ada di database tujuan/);
    expect(await count(target, "orders")).toBe(0);
  });
  it("menolak ekspor kolom BLOB", async () => {
    await source.exec("CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB); INSERT INTO blobs VALUES ('b', x'00ff')");
    await expect(exportTables(source)).rejects.toThrow(/blobs.data/);
  });
});
