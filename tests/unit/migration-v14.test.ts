import { afterEach, describe, expect, it } from "vitest";
import { legacyPrinterHook, LEGACY_PRINTER_ID } from "@/data/migration/hooks/legacyPrinter";
import { NO_LEGACY, NOW, fkViolations, migrate, openAt, userVersion, type Db } from "./support/migrationHarness";
let db: Db;
afterEach(() => db.close());
const setting = (key: string, value: unknown) =>
  db.run("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)", [key, JSON.stringify(value), NOW]);
describe("migrasi V14 printing", () => {
  it("fresh: tabel ada, tanpa printer lama tidak ada baris", async () => {
    db = await openAt(13);
    await migrate(db, NO_LEGACY, 14);
    for (const t of ["printers", "print_routes", "unprinted_receipts"]) expect(await db.query(`SELECT 1 FROM ${t}`)).toEqual([]);
    expect(await userVersion(db)).toBe(14);
  });
  it("printer tunggal lama menjadi satu baris printers", async () => {
    db = await openAt(13);
    await setting("printer.alamat", "AA:BB:CC:DD:EE:FF");
    await setting("printer.nama", "RPP02N");
    await setting("printer.lebar_kertas", "80mm");
    await migrate(db, NO_LEGACY, 14);
    expect(await db.query("SELECT * FROM printers")).toEqual([
      { id: LEGACY_PRINTER_ID, alias: "Kasir", name: "RPP02N", address: "AA:BB:CC:DD:EE:FF", role: "receipt", paper: "80mm" },
    ]);
  });
  it("tanpa nama dan lebar: nama = alamat, kertas 58mm; hook ulang tidak menggandakan", async () => {
    db = await openAt(14);
    await setting("printer.alamat", "11:22");
    await legacyPrinterHook(db);
    await legacyPrinterHook(db);
    expect(await db.query("SELECT name, paper FROM printers")).toEqual([{ name: "11:22", paper: "58mm" }]);
  });
  it("alamat kosong atau bukan teks tidak membuat printer", async () => {
    db = await openAt(14);
    await setting("printer.alamat", "  ");
    await legacyPrinterHook(db);
    await db.run("UPDATE app_settings SET value = '42' WHERE key = 'printer.alamat'");
    await legacyPrinterHook(db);
    expect(await db.query("SELECT id FROM printers")).toEqual([]);
  });
  it("constraint: peran, lebar kertas, alias unik, dan rute butuh printer dan kategori", async () => {
    db = await openAt(14);
    await db.exec("PRAGMA foreign_keys = ON");
    const add = (id: string, alias: string, role: string, paper: string) =>
      db.run("INSERT INTO printers (id, alias, name, address, role, paper) VALUES (?, ?, 'n', 'a', ?, ?)", [id, alias, role, paper]);
    await add("p1", "Dapur", "kitchen", "58mm");
    await expect(add("p2", "Dapur", "kitchen", "58mm")).rejects.toThrow(/UNIQUE/);
    await expect(add("p3", "X", "bar", "58mm")).rejects.toThrow();
    await expect(add("p4", "Y", "receipt", "100mm")).rejects.toThrow();
    await expect(db.run("INSERT INTO print_routes (category_id, printer_id) VALUES ('c1', 'p1')")).rejects.toThrow(/FOREIGN KEY/);
    expect(await fkViolations(db)).toEqual([]);
  });
});
