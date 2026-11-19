import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { exportBackup, restoreIntoEmpty } from "@/data/backupSerializer";
import type { Transaction } from "@/data/migration/runner";
import { UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8 } from "@/data/migrations";
import { backupContentEqual, type BackupDocument } from "@/domain/backup";
import { openSqlJsDb } from "@/testing/sqlJsDb";

// Feature: open-source-pos-upgrade, Property 16: Backup serialization round trip
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

const text = fc.string({ maxLength: 20 });
const dataset: fc.Arbitrary<Dataset> = fc.record({
  categories: fc.uniqueArray(text.filter((s) => s.length > 0), { maxLength: 4 }),
  settings: fc.uniqueArray(fc.tuple(fc.stringMatching(/^[a-z]{1,8}\.[a-z]{1,8}$/), text), { selector: (r) => r[0], maxLength: 5 }),
  ingredients: fc.uniqueArray(fc.tuple(text, fc.double({ min: -1e6, max: 1e6, noNaN: true })), { selector: (r) => r[0], maxLength: 4 }),
  prices: fc.array(fc.integer({ min: 0, max: 999_999_999 }), { maxLength: 4 }),
});

type Dataset = {
  categories: string[];
  settings: Array<[string, string]>;
  ingredients: Array<[string, number]>;
  prices: number[];
};

async function seed(db: Db, d: Dataset) {
  for (const [i, name] of d.categories.entries()) {
    await db.run("INSERT INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)", [`c${i}`, name, T, T]);
    for (const [j, price] of d.prices.entries()) {
      await db.run("INSERT INTO products (id, category_id, name, base_price_rp, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [`p${i}-${j}`, `c${i}`, `${name}${j}`, price, T, T]);
    }
  }
  for (const [k, v] of d.settings) await db.run("INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)", [k, v, T, null]);
  for (const [i, [name, qty]] of d.ingredients.entries()) {
    await db.run("INSERT INTO ingredients (id, name, base_unit, stock_qty, created_at) VALUES (?, ?, ?, ?, ?)", [`i${i}`, name, "ml", qty, T]);
  }
}

function tamper(doc: BackupDocument): BackupDocument | null {
  for (const [name, table] of Object.entries(doc.tables)) {
    for (const [r, row] of table.rows.entries()) {
      for (const [c, cell] of row.entries()) {
        if (cell === null) continue;
        const changed = typeof cell === "number" ? cell + 1 : `${cell}x`;
        const rows = table.rows.map((x, ri) => (ri === r ? x.map((y, ci) => (ci === c ? changed : y)) : x));
        return { ...doc, tables: { ...doc.tables, [name]: { ...table, rows } } };
      }
    }
  }
  return null;
}

describe("Property 16: backup serialization round trip", () => {
  it("serialize, restore ke DB kosong, serialize menghasilkan isi ekuivalen; ubahan pada tables gagal checksum", async () => {
    await fc.assert(
      fc.asyncProperty(dataset, async (d) => {
        const [source, target] = await Promise.all([migratedDb(), migratedDb()]);
        try {
          await seed(source, d);
          const doc = await exportBackup(source, { createdAt: T, appVersion: "1.1.0", sha256 });
          const changed = tamper(doc);
          if (changed) {
            await expect(restoreIntoEmpty(target, changed, { transaction: txFor(target), sha256, latestSchemaVersion: 8 })).rejects.toMatchObject({ reason: "checksum" });
          }
          await restoreIntoEmpty(target, doc, { transaction: txFor(target), sha256, latestSchemaVersion: 8 });
          const again = await exportBackup(target, { createdAt: "2027-01-01T00:00:00.000Z", appVersion: "1.1.0", sha256 });
          expect(backupContentEqual(doc, again)).toBe(true);
          expect(again.checksum).toBe(doc.checksum);
        } finally {
          source.close();
          target.close();
        }
      }),
      { numRuns: 100 },
    );
  }, 120_000);
});
