import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations, type Transaction } from "@/data/migration/runner";
import type { MigrationStep } from "@/domain/migration";
import { openSqlJsDb } from "@/testing/sqlJsDb";

// Complements migration-runner.test.ts (task 6.8): hook failure rollback and afterCommit on failure.
type Db = Awaited<ReturnType<typeof openSqlJsDb>>;

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
const userVersion = async (db: Db) => (await db.query<{ user_version: number }>("PRAGMA user_version"))[0].user_version;
const rows = async (db: Db) => db.query<{ n: string }>("SELECT n FROM data ORDER BY n");

let db: Db;
beforeEach(async () => {
  db = await openSqlJsDb();
});
afterEach(() => db.close());

describe("runMigrations: kegagalan hook", () => {
  const steps = (): MigrationStep[] => [
    { version: 1, statements: ["CREATE TABLE data (n TEXT)", "INSERT INTO data VALUES ('lama')"] },
    { version: 2, statements: ["INSERT INTO data VALUES ('dari-langkah-2')"], hook: "gagal" },
  ];
  const hooks = { gagal: async (tx: Db) => { await tx.exec("INSERT INTO data VALUES ('dari-hook')"); throw new Error("hook gagal"); } };

  it("hook yang melempar error membatalkan seluruh langkah: versi tetap dan data utuh", async () => {
    await expect(runMigrations({ db, transaction: txFor(db), steps: steps(), latest: 2, hooks })).rejects.toThrow("hook gagal");
    expect(await userVersion(db)).toBe(1);
    expect(await rows(db)).toEqual([{ n: "lama" }]);
    expect(await db.query("SELECT version FROM schema_migrations")).toEqual([{ version: 1 }]);
  });

  it("afterCommit tidak berjalan saat migrasi gagal", async () => {
    let called = false;
    await expect(
      runMigrations({ db, transaction: txFor(db), steps: steps(), latest: 2, hooks, afterCommit: [async () => { called = true; }] }),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });

  it("setelah hook diperbaiki, menjalankan ulang melanjutkan dari versi terakhir yang commit", async () => {
    await expect(runMigrations({ db, transaction: txFor(db), steps: steps(), latest: 2, hooks })).rejects.toThrow();
    const fixed = { gagal: async () => {} };
    const result = await runMigrations({ db, transaction: txFor(db), steps: steps(), latest: 2, hooks: fixed });
    expect(result.applied).toEqual([2]);
    expect(await rows(db)).toEqual([{ n: "dari-langkah-2" }, { n: "lama" }]);
  });
});
