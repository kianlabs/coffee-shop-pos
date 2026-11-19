import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations, MigrationError, type Transaction } from "@/data/migration/runner";
import { UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7 } from "@/data/migrations";
import type { MigrationStep } from "@/domain/migration";
import { openSqlJsDb } from "@/testing/sqlJsDb";

type Db = Awaited<ReturnType<typeof openSqlJsDb>>;

const REAL_STEPS: MigrationStep[] = [UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7].map(
  (statements, i) => ({ version: i + 1, statements }),
);

/** Test transaction: BEGIN/COMMIT, ROLLBACK on error. Mirrors withTransaction without the plugin. */
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

const versions = async (db: Db) =>
  (await db.query<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version")).map((r) => r.version);
const userVersion = async (db: Db) => (await db.query<{ user_version: number }>("PRAGMA user_version"))[0].user_version;

let db: Db;
beforeEach(async () => {
  db = await openSqlJsDb();
});
afterEach(() => db.close());

describe("runMigrations", () => {
  it("database kosong: menerapkan semua versi dan mencatat checksum", async () => {
    const result = await runMigrations({ db, transaction: txFor(db), steps: REAL_STEPS, latest: 7, now: () => "2026-11-19T00:00:00Z" });
    expect(result.applied).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(await versions(db)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(await userVersion(db)).toBe(7);
  });

  it("dijalankan dua kali tidak menerapkan ulang dan tidak menduplikasi baris", async () => {
    const opts = { db, transaction: txFor(db), steps: REAL_STEPS, latest: 7 };
    await runMigrations(opts);
    const second = await runMigrations(opts);
    expect(second.applied).toEqual([]);
    expect(await versions(db)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("database lama dengan user_version 3 dibootstrap lalu hanya menjalankan 4..7", async () => {
    for (const batch of [UPGRADE_V1, UPGRADE_V2, UPGRADE_V3]) for (const s of batch) await db.exec(s);
    await db.exec("PRAGMA user_version = 3");
    const result = await runMigrations({ db, transaction: txFor(db), steps: REAL_STEPS, latest: 7 });
    expect(result.applied).toEqual([4, 5, 6, 7]);
    expect(await versions(db)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("langkah yang gagal di-rollback: statement, baris, dan user_version tidak berubah", async () => {
    const steps: MigrationStep[] = [
      { version: 1, statements: ["CREATE TABLE a (id INTEGER)"] },
      { version: 2, statements: ["CREATE TABLE b (id INTEGER)", "SELECT * FROM tabel_tidak_ada"] },
    ];
    await expect(runMigrations({ db, transaction: txFor(db), steps, latest: 2 })).rejects.toThrow();
    const tables = (await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => r.name);
    expect(tables).toContain("a");
    expect(tables).not.toContain("b");
    expect(await versions(db)).toEqual([1]);
    expect(await userVersion(db)).toBe(1);
  });

  it("menolak database yang versinya lebih baru dari aplikasi", async () => {
    await db.exec("PRAGMA user_version = 9");
    await expect(runMigrations({ db, transaction: txFor(db), steps: REAL_STEPS, latest: 7 })).rejects.toBeInstanceOf(MigrationError);
  });

  it("menolak checksum yang tidak cocok (langkah sudah diubah)", async () => {
    await runMigrations({ db, transaction: txFor(db), steps: REAL_STEPS.slice(0, 2), latest: 2 });
    const tampered = [REAL_STEPS[0], { version: 2, statements: ["SELECT 1"] }];
    await expect(runMigrations({ db, transaction: txFor(db), steps: tampered, latest: 2 })).rejects.toThrow(/Checksum/);
  });

  it("menjalankan hook data dan afterCommit setelah commit", async () => {
    await db.exec("CREATE TABLE tanda (nilai TEXT)");
    const steps: MigrationStep[] = [{ version: 1, statements: [], hook: "tandai" }];
    const calls: string[] = [];
    await runMigrations({
      db,
      transaction: txFor(db),
      steps,
      latest: 1,
      hooks: { tandai: async (tx) => { await tx.exec("INSERT INTO tanda VALUES ('ok')"); calls.push("hook"); } },
      afterCommit: [async () => { calls.push("afterCommit"); }],
    });
    expect(calls).toEqual(["hook", "afterCommit"]);
    expect(await db.query("SELECT nilai FROM tanda")).toEqual([{ nilai: "ok" }]);
  });

  it("hook yang belum terdaftar menghentikan migrasi", async () => {
    const steps: MigrationStep[] = [{ version: 1, statements: [], hook: "tidak_ada" }];
    await expect(runMigrations({ db, transaction: txFor(db), steps, latest: 1 })).rejects.toThrow(/belum terdaftar/);
  });

  it("rantai migrasi yang terputus ditolak sebelum menyentuh database", async () => {
    const steps: MigrationStep[] = [{ version: 1, statements: [] }, { version: 3, statements: [] }];
    await expect(runMigrations({ db, transaction: txFor(db), steps, latest: 3 })).rejects.toThrow(/terputus/);
    expect(await userVersion(db)).toBe(0);
  });
});
