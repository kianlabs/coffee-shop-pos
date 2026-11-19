import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PERF, createRng, generatePerfData, type PerfConfig } from "../support/perfData";
import { insertPerfData } from "../support/perfDataInsert";
import { openSqlJsDb } from "@/testing/sqlJsDb";
import { LATEST_VERSION } from "@/data/migration/steps";
import { migrate, userVersion } from "./support/migrationHarness";
const SMALL: PerfConfig = { ...DEFAULT_PERF, orders: 120, products: 15, ingredients: 5 };
let db: Awaited<ReturnType<typeof openSqlJsDb>> | undefined;
afterEach(() => db?.close());
describe("pembangkit data kinerja", () => {
  it("deterministik untuk seed yang sama dan berbeda untuk seed lain", () => {
    expect(generatePerfData(SMALL)).toEqual(generatePerfData(SMALL));
    expect(generatePerfData({ ...SMALL, seed: 43 }).orders).not.toEqual(generatePerfData(SMALL).orders);
  });
  it("PRNG tetap di [0,1) dan dapat diulang", () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("jumlah baris sesuai konfigurasi dan tanggal tidak valid ditolak", () => {
    const rows = generatePerfData(SMALL);
    expect(rows.orders).toHaveLength(120);
    expect(rows.products).toHaveLength(15);
    expect(rows.payments).toHaveLength(120);
    expect(rows.movements).toHaveLength(240);
    expect(rows.items.length).toBeGreaterThanOrEqual(120);
    expect(() => generatePerfData({ ...SMALL, startIso: "bukan tanggal" })).toThrow();
  });
  it("dimuat ke skema V18 (semua migrasi) tanpa pelanggaran kunci asing atau constraint", async () => {
    db = await openSqlJsDb();
    await migrate(db);
    expect(await userVersion(db)).toBe(LATEST_VERSION);
    expect(LATEST_VERSION).toBeGreaterThanOrEqual(18);
    await db.exec("PRAGMA foreign_keys = ON");
    await insertPerfData(db, generatePerfData(SMALL));
    expect(await db.query("SELECT COUNT(*) AS n FROM orders")).toEqual([{ n: 120 }]);
    expect(await db.query("PRAGMA foreign_key_check")).toEqual([]);
  });
  it("insert yang gagal dibatalkan seluruhnya", async () => {
    db = await openSqlJsDb();
    await migrate(db);
    const rows = generatePerfData(SMALL);
    rows.orders.push(rows.orders[0]);
    await expect(insertPerfData(db, rows)).rejects.toThrow();
    expect(await db.query("SELECT COUNT(*) AS n FROM orders")).toEqual([{ n: 0 }]);
  });
});
