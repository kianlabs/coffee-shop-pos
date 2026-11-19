import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  backupContentEqual,
  canonicalJson,
  compareCells,
  createBackupDocument,
  normalizeTables,
  parseBackupDocument,
  serializeBackupDocument,
  verifyBackupDocument,
  type BackupCell,
  type BackupTables,
} from "@/domain/backup";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const asyncSha = async (s: string) => sha256(s);
const TABLES: BackupTables = {
  orders: { columns: ["id", "total_rp", "notes"], rows: [["o2", 5000, null], ["o1", 18000, "tanpa gula"]] },
  app_settings: { columns: ["key", "value"], rows: [["toko.nama", "Suro"]] },
};
const input = { schemaVersion: 8, createdAt: "2026-11-19T10:00:00.000Z", appVersion: "1.1.0", tables: TABLES };
const verify = { sha256, latestSchemaVersion: 8 };
describe("canonicalJson", () => {
  it("mengurutkan kunci di setiap tingkat dan membuang undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, "x", null], c: true }, z: undefined })).toBe('{"a":{"c":true,"d":[1,"x",null]},"b":1}');
  });
  it("menolak angka tak hingga dan tipe yang tidak didukung", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow();
    expect(() => canonicalJson(() => 1)).toThrow();
  });
});
describe("normalizeTables", () => {
  it("mengurutkan tabel dan baris tanpa mengubah input", () => {
    const out = normalizeTables(TABLES);
    expect(Object.keys(out)).toEqual(["app_settings", "orders"]);
    expect(out.orders.rows.map((r) => r[0])).toEqual(["o1", "o2"]);
    expect(TABLES.orders.rows[0][0]).toBe("o2");
  });
  it("urutan sel: null < angka < teks", () => {
    expect(compareCells(null, 0)).toBeLessThan(0);
    expect(compareCells(9, "1")).toBeLessThan(0);
    expect(compareCells("b", "a")).toBeGreaterThan(0);
    expect(compareCells(null, null)).toBe(0);
    expect(compareCells(2, 2)).toBe(0);
  });
  it("properti: urutan baris input tidak mengubah bentuk kanonis", () => {
    const cell: fc.Arbitrary<BackupCell> = fc.oneof(fc.constant(null), fc.integer(), fc.string());
    const rows = fc.uniqueArray(fc.tuple(fc.string(), cell, cell), { selector: (r) => r[0] });
    fc.assert(
      fc.property(rows, (r) => {
        const a = canonicalJson(normalizeTables({ t: { columns: ["id", "a", "b"], rows: r } }));
        const b = canonicalJson(normalizeTables({ t: { columns: ["id", "a", "b"], rows: [...r].reverse() } }));
        expect(a).toBe(b);
      }),
    );
  });
});
describe("dokumen backup", () => {
  it("membuat dokumen pos-backup-v3 dengan checksum sha256", async () => {
    const doc = await createBackupDocument(input, sha256);
    expect(doc.format).toBe(BACKUP_FORMAT);
    expect(doc.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await createBackupDocument(input, asyncSha)).toEqual(doc);
  });
  it("serialize lalu parse menghasilkan dokumen yang sama dan lolos verifikasi", async () => {
    const doc = await createBackupDocument(input, sha256);
    const parsed = parseBackupDocument(serializeBackupDocument(doc));
    if (!parsed.ok) throw new Error("parse gagal");
    expect(parsed.document).toEqual(doc);
    expect(await verifyBackupDocument(parsed.document, verify)).toBeNull();
  });
  it("menolak checksum yang tidak cocok setelah satu nilai diubah", async () => {
    const doc = await createBackupDocument(input, sha256);
    const text = serializeBackupDocument(doc).replace('"Suro"', '"Sura"');
    const parsed = parseBackupDocument(text);
    if (!parsed.ok) throw new Error("parse gagal");
    expect(await verifyBackupDocument(parsed.document, verify)).toBe("checksum");
  });
  it("menolak versi skema yang lebih baru dari aplikasi", async () => {
    const doc = await createBackupDocument({ ...input, schemaVersion: 9 }, sha256);
    expect(await verifyBackupDocument(doc, verify)).toBe("newer-schema");
  });
  it.each([
    ["bukan JSON", "{"],
    ["format lain", JSON.stringify({ format: "pos-backup-v2" })],
    ["baris tidak sepanjang kolom", '{"format":"pos-backup-v3","schemaVersion":8,"createdAt":"","appVersion":"","checksum":"sha256:x","tables":{"t":{"columns":["a"],"rows":[[1,2]]}}}'],
    ["kolom duplikat", '{"format":"pos-backup-v3","schemaVersion":8,"createdAt":"","appVersion":"","checksum":"sha256:x","tables":{"t":{"columns":["a","a"],"rows":[]}}}'],
    ["sel bertipe objek", '{"format":"pos-backup-v3","schemaVersion":8,"createdAt":"","appVersion":"","checksum":"sha256:x","tables":{"t":{"columns":["a"],"rows":[[{}]]}}}'],
    ["checksum tanpa awalan", '{"format":"pos-backup-v3","schemaVersion":8,"createdAt":"","appVersion":"","checksum":"x","tables":{}}'],
    ["versi negatif", '{"format":"pos-backup-v3","schemaVersion":-1,"createdAt":"","appVersion":"","checksum":"sha256:x","tables":{}}'],
  ])("parse menolak %s", (_label, text) => {
    const parsed = parseBackupDocument(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toMatch(/tidak valid/);
  });
  it("kesetaraan isi mengabaikan createdAt, checksum, dan urutan baris", async () => {
    const a = await createBackupDocument(input, sha256);
    const b = await createBackupDocument({ ...input, createdAt: "2027-01-01T00:00:00.000Z" }, sha256);
    expect(backupContentEqual(a, { ...b, tables: TABLES })).toBe(true);
    expect(backupContentEqual(a, { ...b, appVersion: "1.2.0" })).toBe(false);
  });
});
