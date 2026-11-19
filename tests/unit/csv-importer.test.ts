import { describe, expect, it } from "vitest";
import { CsvImporter, type ImportLimits, type ImportPreview } from "@/services/csvImporter";
import { createMemoryCatalogDb } from "@/testing/memory/catalogImport";
import { fixedClock, sequentialIds } from "@/testing/memory/settings";

const LIMITS: ImportLimits = { maxSizeMb: 1, maxRows: 100, maxPriceRp: 99_999_999 };
const HEADER = "category,product,variant,price_rp,hpp_manual_rp\r\n";
const owner = { id: "u-owner", role: "owner" as const };
const kasir = { id: "u-kasir", role: "kasir" as const };
const bytes = (s: string) => new TextEncoder().encode(s);
const file = (s: string) => ({ name: "katalog.csv", bytes: bytes(s) });

function setup(seed: Parameters<typeof createMemoryCatalogDb>[0] = [], limits = LIMITS) {
  const db = createMemoryCatalogDb(seed);
  const importer = new CsvImporter({ uow: db.uow, clock: fixedClock(), ids: sequentialIds("a"), limits: () => limits });
  return { db, importer };
}
function ok(p: ImportPreview): Extract<ImportPreview, { ok: true }> {
  if (!p.ok) throw new Error(`rejected: ${p.message}`);
  return p;
}

describe("CsvImporter.parse", () => {
  it("previews new, updated and error rows with file line numbers, writing nothing", async () => {
    const { db, importer } = setup([{ category: "Kopi", product: "Latte", variant: "", priceRp: 20000, hppManualRp: null }]);
    const csv = HEADER + "Kopi,Latte,,22000,\r\nKopi,Mocha,,25000,9000\r\n,Teh,,5000,\r\nKopi,Mocha,,1,\r\nKopi,Aneh,,12.5,\r\nKopi,Cols,1";
    const p = ok(await importer.parse(file(csv)));
    expect([p.newCount, p.updatedCount]).toEqual([1, 1]);
    expect(p.errors.map((e) => e.line)).toEqual([4, 5, 6, 7]);
    expect(p.errors[1]?.message).toContain("baris 3");
    expect(db.catalog.size).toBe(1);
    expect(db.audit).toHaveLength(0);
  });

  it("flags price above the configured max and a bad HPP", async () => {
    const { importer } = setup([], { ...LIMITS, maxPriceRp: 1_000_000 });
    const p = ok(await importer.parse(file(HEADER + "A,B,,1000001,\r\nA,C,,1,-5\r\nA,D,,\r\n")));
    expect(p.errors.map((e) => e.line)).toEqual([2, 3, 4]);
  });

  it("rejects the whole file for bad header, encoding, size, row count and broken quoting", async () => {
    const { importer } = setup();
    const code = async (f: { name: string; bytes: Uint8Array }) => {
      const p = await importer.parse(f);
      return p.ok ? "ok" : p.code;
    };
    expect(await code(file("a,b\r\n1,2\r\n"))).toBe("header");
    expect(await code(file(""))).toBe("header");
    expect(await code({ name: "x.csv", bytes: new Uint8Array([0xff, 0xfe, 0x41]) })).toBe("encoding");
    expect(await code({ name: "x.csv", bytes: new Uint8Array(1024 * 1024 + 1) })).toBe("size");
    expect(await code(file(HEADER + 'A,"B,,1,\r\n'))).toBe("csv");
    const many = HEADER + Array.from({ length: 101 }, (_, i) => `A,P${i},,1,`).join("\r\n");
    expect(await code(file(many))).toBe("rows");
  });

  it("accepts a BOM and keeps quoted commas, quotes and non-ASCII text", async () => {
    const { importer } = setup();
    const p = ok(await importer.parse(file('\uFEFF' + HEADER + '"Kopi, Susu","Es ""Gula"" Aren",Besar ☕,18000,7000\r\n')));
    expect(p.rows[0]).toEqual({ category: "Kopi, Susu", product: 'Es "Gula" Aren', variant: "Besar ☕", priceRp: 18000, hppManualRp: 7000 });
  });
});

describe("CsvImporter.commit", () => {
  const csv = HEADER + "Kopi,Latte,,22000,\r\nKopi,Mocha,,25000,9000\r\n,Bad,,1,\r\n";
  const seed = [{ category: "Kopi", product: "Latte", variant: "", priceRp: 20000, hppManualRp: null }];

  it("applies valid rows, skips error rows, writes one audit row", async () => {
    const { db, importer } = setup(seed);
    const r = await importer.commit(ok(await importer.parse(file(csv))), owner);
    expect(r).toEqual({ ok: true, created: 1, updated: 1, skipped: 1 });
    expect(db.catalog.size).toBe(2);
    expect([...db.catalog.values()].find((x) => x.product === "Latte")?.priceRp).toBe(22000);
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ actorId: "u-owner", approverId: null, after: { fileName: "katalog.csv", created: 1, updated: 1, skipped: 1 } });
  });

  it("rolls back catalog and audit when the write fails, with no audit row", async () => {
    const { db, importer } = setup(seed);
    const p = ok(await importer.parse(file(csv)));
    db.failUpsert = true;
    const r = await importer.commit(p, owner);
    expect(r).toMatchObject({ ok: false, code: "import_failed" });
    expect([...db.catalog.values()]).toEqual(seed);
    expect(db.audit).toHaveLength(0);
  });

  it("rolls back the catalog when the audit append fails", async () => {
    const { db, importer } = setup(seed);
    const p = ok(await importer.parse(file(csv)));
    db.failAudit = true;
    expect(await importer.commit(p, owner)).toMatchObject({ code: "import_failed" });
    expect([...db.catalog.values()]).toEqual(seed);
  });

  it("refuses when no valid row is left", async () => {
    const { importer } = setup();
    const r = await importer.commit(ok(await importer.parse(file(HEADER + ",x,,1,\r\n"))), owner);
    expect(r).toMatchObject({ ok: false, code: "nothing_to_import" });
  });

  it("needs a supervisor or owner approver when a kasir changes price or HPP", async () => {
    const { db, importer } = setup(seed);
    const p = ok(await importer.parse(file(csv)));
    expect(await importer.commit(p, kasir)).toMatchObject({ ok: false, code: "approval_required" });
    expect(await importer.commit(p, kasir, kasir)).toMatchObject({ code: "approval_required" });
    expect(db.catalog.size).toBe(1);
    expect(db.audit).toHaveLength(0);
    expect(await importer.commit(p, kasir, { id: "u-sup", role: "supervisor" })).toMatchObject({ ok: true });
    expect(db.audit[0]).toMatchObject({ actorId: "u-kasir", approverId: "u-sup", actionType: "csv_import_price" });
  });

  it("lets a kasir re-import identical rows without approval", async () => {
    const same = [{ category: "Kopi", product: "Latte", variant: "", priceRp: 22000, hppManualRp: null }];
    const { importer } = setup(same);
    const p = ok(await importer.parse(file(HEADER + "Kopi,Latte,,22000,\r\n")));
    expect(await importer.commit(p, kasir)).toMatchObject({ ok: true, created: 0, updated: 1 });
  });

  it("recomputes counts and approval against the catalog at commit time", async () => {
    const { db, importer } = setup();
    const p = ok(await importer.parse(file(HEADER + "Kopi,Latte,,22000,\r\n")));
    expect(p.newCount).toBe(1);
    db.catalog.set(JSON.stringify(["Kopi", "Latte", ""]), { category: "Kopi", product: "Latte", variant: "", priceRp: 22000, hppManualRp: null });
    expect(await importer.commit(p, kasir)).toMatchObject({ ok: true, created: 0, updated: 1 });
  });
});
