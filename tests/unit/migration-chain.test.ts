import { afterEach, describe, expect, it } from "vitest";
import { createMigrationHooks } from "@/data/migration/hooks";
import { runMigrations } from "@/data/migration/runner";
import { LATEST_VERSION, MIGRATION_STEPS } from "@/data/migration/steps";
import { validateChain } from "@/domain/migration";
import { openSqlJsDb } from "@/testing/sqlJsDb";
import { NO_LEGACY, NOW, fkViolations, migrate, openAt, txFor, userVersion, type Db } from "./support/migrationHarness";
let db: Db;
afterEach(() => db?.close());
const schema = (d: Db) =>
  d.query<{ type: string; name: string; sql: string }>("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' ORDER BY name");
describe("rantai migrasi V1..V18", () => {
  it("berurutan tanpa celah dan berakhir di V18", () => {
    expect(validateChain(MIGRATION_STEPS)).toBeNull();
    expect(LATEST_VERSION).toBe(18);
  });
  it("setiap nama hook di langkah terdaftar", () => {
    const { hooks } = createMigrationHooks({ legacy: NO_LEGACY, now: () => NOW });
    for (const step of MIGRATION_STEPS) if (step.hook) expect(Object.keys(hooks)).toContain(step.hook);
  });
  it("database baru V1 sampai V18 lewat runner: versi, catatan, FK, integritas", async () => {
    db = await openSqlJsDb();
    expect(await migrate(db)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(await userVersion(db)).toBe(18);
    expect(await db.query("SELECT version FROM schema_migrations ORDER BY version")).toHaveLength(18);
    expect(await fkViolations(db)).toEqual([]);
    expect(await db.query("PRAGMA integrity_check")).toEqual([{ integrity_check: "ok" }]);
  });
  it("skema lewat runner sama dengan menjalankan pernyataan saja", async () => {
    db = await openSqlJsDb();
    await migrate(db);
    const viaRunner = await schema(db);
    const plain = await openAt(18);
    expect(await schema(plain)).toEqual(viaRunner);
    plain.close();
  });
  it("dijalankan ulang: tidak ada versi baru dan data tidak berubah", async () => {
    db = await openSqlJsDb();
    await migrate(db);
    const before = await schema(db);
    expect(await migrate(db)).toEqual([]);
    expect(await schema(db)).toEqual(before);
    expect(await db.query("SELECT version FROM schema_migrations")).toHaveLength(18);
  });
  it("hook gagal pada versi tertentu hanya membatalkan versi itu", async () => {
    db = await openSqlJsDb();
    const { hooks } = createMigrationHooks({ legacy: NO_LEGACY, now: () => NOW });
    hooks.legacy_printer = async () => {
      throw new Error("hook V14 gagal");
    };
    await expect(runMigrations({ db, transaction: txFor(db), steps: MIGRATION_STEPS, latest: 18, hooks })).rejects.toThrow("hook V14 gagal");
    expect(await userVersion(db)).toBe(13);
    expect(await db.query("SELECT name FROM sqlite_master WHERE name = 'printers'")).toEqual([]);
    expect(await db.query("SELECT name FROM sqlite_master WHERE name = 'suppliers'")).toHaveLength(1);
    // Retry with the real hooks resumes at the failed version.
    expect(await migrate(db)).toEqual([14, 15, 16, 17, 18]);
  });
});
