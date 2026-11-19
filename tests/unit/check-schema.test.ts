import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkSchema, loadMigrations, normalizeSql } from "../../scripts/check-schema.mjs";
const ROOT = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts/check-schema.mjs");
const V1 = [
  "CREATE TABLE IF NOT EXISTS parent (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);",
  "CREATE TABLE IF NOT EXISTS child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent(id), qty INTEGER NOT NULL DEFAULT 0);",
  "CREATE INDEX IF NOT EXISTS idx_child_parent ON child(parent_id);",
];
const V2 = [
  "ALTER TABLE child ADD COLUMN note TEXT;",
  "CREATE TRIGGER IF NOT EXISTS trg_child_no_delete BEFORE DELETE ON child BEGIN SELECT RAISE(ABORT, 'no'); END;",
];
const GOOD = `-- referensi
CREATE TABLE parent (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE child (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES parent(id), /* FK */
  qty INTEGER NOT NULL DEFAULT 0,
  note TEXT
);
CREATE INDEX idx_child_parent ON child(parent_id);
CREATE TRIGGER trg_child_no_delete BEFORE DELETE ON child BEGIN SELECT RAISE(ABORT, 'no'); END;`;
const diffsFor = (referenceSql: string) => checkSchema({ migrations: [V1, V2], referenceSql });
const dirs: string[] = [];
function fixtureRepo(migrationsTs: string, schemaSql: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "check-schema-"));
  dirs.push(dir);
  mkdirSync(path.join(dir, "src/data"), { recursive: true });
  mkdirSync(path.join(dir, "database"));
  writeFileSync(path.join(dir, "src/data/migrations.ts"), migrationsTs);
  writeFileSync(path.join(dir, "database/sqlite-schema.sql"), schemaSql);
  return dir;
}
const MIGRATIONS_TS = `export const DB_VERSION = 2;
export const UPGRADE_V2: string[] = ${JSON.stringify(V2)};
export const UPGRADE_V1: string[] = ${JSON.stringify(V1)};
`;
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
describe("normalizeSql", () => {
  it("membuang komentar dan spasi tetapi menjaga literal string", () => {
    expect(normalizeSql("CREATE TABLE t ( -- komentar\n a TEXT DEFAULT 'x -- , y' /* c */ );")).toBe("CREATE TABLE t(a TEXT DEFAULT 'x -- , y')");
    expect(normalizeSql(null)).toBeNull();
  });
});
describe("checkSchema (fixture)", () => {
  it("lulus bila referensi sama dengan hasil migrasi, termasuk kolom ALTER di akhir", async () => {
    expect(await diffsFor(GOOD)).toEqual([]);
  });
  it("menyebut kolom yang hilang, tipe, nullability, dan default yang berbeda", async () => {
    const diffs = (await diffsFor(GOOD.replace("  note TEXT\n", "  extra TEXT\n").replace("qty INTEGER NOT NULL DEFAULT 0", "qty REAL DEFAULT 1"))).join("\n");
    expect(diffs).toContain("tabel child, kolom note: hanya ada di migrasi");
    expect(diffs).toContain("tabel child, kolom extra: hanya ada di referensi");
    expect(diffs).toContain('tabel child, kolom qty: type migrasi="INTEGER" referensi="REAL"');
    expect(diffs).toContain("tabel child, kolom qty: notnull migrasi=1 referensi=0");
    expect(diffs).toContain('tabel child, kolom qty: dflt_value migrasi="0" referensi="1"');
  });
  it("menyebut indeks, FK, trigger, dan tabel yang berbeda", async () => {
    const ref = GOOD.replace("CREATE INDEX idx_child_parent ON child(parent_id);", "CREATE INDEX idx_child_qty ON child(qty);")
      .replace("REFERENCES parent(id)", "REFERENCES parent(id) ON DELETE CASCADE")
      .replace(/CREATE TRIGGER[^\n]*/, "CREATE TABLE extra (id TEXT);");
    const diffs = (await diffsFor(ref)).join("\n");
    expect(diffs).toContain("tabel child, indeks idx_child_parent: hanya ada di migrasi");
    expect(diffs).toContain("tabel child, indeks idx_child_qty: hanya ada di referensi");
    expect(diffs).toContain('tabel child, FK parent_id -> parent(id): on_delete migrasi="NO ACTION" referensi="CASCADE"');
    expect(diffs).toContain("objek trigger trg_child_no_delete: hanya ada di migrasi");
    expect(diffs).toContain("tabel extra: hanya ada di referensi");
  });
  it("menyebut CHECK dan urutan kolom yang berbeda lewat SQL CREATE", async () => {
    const ref = GOOD.replace("qty INTEGER NOT NULL DEFAULT 0,\n  note TEXT", "note TEXT,\n  qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0)");
    const diffs = (await diffsFor(ref)).join("\n");
    expect(diffs).toContain("tabel child: urutan kolom migrasi=id,parent_id,qty,note referensi=id,parent_id,note,qty");
    expect(diffs).toContain("tabel child: SQL CREATE berbeda");
  });
});
describe("loadMigrations", () => {
  it("memuat UPGRADE_Vn berurutan dari file TypeScript", async () => {
    const dir = fixtureRepo(MIGRATIONS_TS, GOOD);
    expect(await loadMigrations(path.join(dir, "src/data/migrations.ts"))).toEqual([V1, V2]);
  });
  it("menolak rantai yang terputus", async () => {
    const dir = fixtureRepo("export const UPGRADE_V2: string[] = [];\n", GOOD);
    await expect(loadMigrations(path.join(dir, "src/data/migrations.ts"))).rejects.toThrow(/UPGRADE_V1/);
  });
});
describe("CLI check-schema", () => {
  const run = (dir: string) => spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
  it("keluar 0 pada fixture yang cocok", () => {
    const result = run(fixtureRepo(MIGRATIONS_TS, GOOD));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("check-schema lulus");
  });
  it("keluar 1 dan mencetak selisih pada fixture yang berbeda", () => {
    const result = run(fixtureRepo(MIGRATIONS_TS, GOOD.replace(",\n  note TEXT", "")));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("tabel child, kolom note: hanya ada di migrasi");
  });
  it("lulus untuk repositori ini (V1..V8 vs database/sqlite-schema.sql)", () => {
    const result = run(ROOT);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
