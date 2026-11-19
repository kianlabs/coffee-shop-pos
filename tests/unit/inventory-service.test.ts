import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { balance, type Movement } from "@/domain/stockLedger";
import { InventoryService } from "@/services/inventoryService";
import { SettingsService } from "@/services/settingsService";
import { createMemoryInventoryDb, type MemoryInventoryDb } from "@/testing/memory/inventory";
import { sequentialIds } from "@/testing/memory/settings";

const owner = { id: "u-owner", role: "owner" } as const;
let db: MemoryInventoryDb;
let service: InventoryService;

function make(): InventoryService {
  const clock = { now: () => new Date("2026-11-19T08:00:00.000Z") };
  const settings = new SettingsService({ uow: db.base.uow, clock, ids: sequentialIds("s") });
  return new InventoryService({ uow: db.uow, settings, clock, ids: sequentialIds("i") });
}
function seed(): void {
  db.ingredients.set("kopi", { id: "kopi", name: "Biji kopi", minStockMilli: 500_000 });
  db.ingredients.set("susu", { id: "susu", name: "Susu", minStockMilli: null });
}
async function supplier(name = "CV Maju"): Promise<string> {
  const r = await service.addSupplier(owner, { name });
  if (!r.ok) throw new Error(r.message);
  return r.value.id;
}
const stockOf = (id: string): number => db.stock.get(id) ?? 0;
const ledger = (id: string): number => balance(db.movements.filter((m) => m.ingredientId === id) as Movement[]);

beforeEach(() => {
  db = createMemoryInventoryDb();
  seed();
  service = make();
});

describe("suppliers", () => {
  it("menyimpan supplier dan menolak nama sama tanpa memandang huruf", async () => {
    await supplier("CV Maju");
    const dup = await service.addSupplier(owner, { name: "  cv MAJU " });
    expect(dup).toMatchObject({ ok: false, code: "invalid_input", fields: { name: expect.stringContaining("sudah dipakai") } });
    expect(db.suppliers.size).toBe(1);
  });
  it("menyebut setiap isian yang tidak valid", async () => {
    const r = await service.addSupplier(owner, { name: "", contact: "c".repeat(101), note: "n".repeat(501) });
    expect(r.ok === false && Object.keys(r.fields ?? {}).sort()).toEqual(["contact", "name", "note"]);
    expect(db.suppliers.size).toBe(0);
  });
});

describe("purchases", () => {
  it("menaikkan stok, membuat movement dan riwayat biaya per satuan", async () => {
    const sid = await supplier();
    const r = await service.recordPurchase(owner, { supplierId: sid, ingredientId: "kopi", qtyMilli: 2_000, totalRp: 50_000 });
    expect(r.ok && r.value.unitCostRp).toBe(25_000);
    expect(stockOf("kopi")).toBe(2_000);
    expect(db.movements).toMatchObject([{ type: "purchase_received", qtyMilli: 2_000, refType: "purchase" }]);
    expect(db.costHistory).toMatchObject([{ ingredientId: "kopi", costPerUnitRp: 25_000 }]);
  });
  it("membulatkan biaya per satuan dari total ÷ jumlah", async () => {
    const sid = await supplier();
    const r = await service.recordPurchase(owner, { supplierId: sid, ingredientId: "kopi", qtyMilli: 3_000, totalRp: 10_000 });
    expect(r.ok && r.value.unitCostRp).toBe(3_333);
  });
  it.each([
    [{ qtyMilli: 0, totalRp: 1 }, "qtyMilli"],
    [{ qtyMilli: -5, totalRp: 1 }, "qtyMilli"],
    [{ qtyMilli: 1.5, totalRp: 1 }, "qtyMilli"],
    [{ qtyMilli: 1000, totalRp: -1 }, "totalRp"],
    [{ qtyMilli: 1000, totalRp: 1_000_000_000 }, "totalRp"],
  ])("menolak %j", async (input, field) => {
    const sid = await supplier();
    const r = await service.recordPurchase(owner, { supplierId: sid, ingredientId: "kopi", ...input });
    expect(r).toMatchObject({ ok: false, code: "invalid_input" });
    expect(r.ok === false && r.fields).toHaveProperty(field);
    expect(db.movements).toHaveLength(0);
    expect(db.costHistory).toHaveLength(0);
  });
  it("menerima total 0 dan 999.999.999", async () => {
    const sid = await supplier();
    expect((await service.recordPurchase(owner, { supplierId: sid, ingredientId: "kopi", qtyMilli: 1000, totalRp: 0 })).ok).toBe(true);
    expect((await service.recordPurchase(owner, { supplierId: sid, ingredientId: "kopi", qtyMilli: 1000, totalRp: 999_999_999 })).ok).toBe(true);
  });
  it("menolak supplier tidak tersimpan dan bahan tidak dikenal", async () => {
    const r = await service.recordPurchase(owner, { supplierId: "x", ingredientId: "x", qtyMilli: 1000, totalRp: 1 });
    expect(r.ok === false && Object.keys(r.fields ?? {}).sort()).toEqual(["ingredientId", "supplierId"]);
  });
  it("membatalkan semuanya saat movement gagal ditulis", async () => {
    const sid = await supplier();
    db.failMovements = true;
    const r = await service.recordPurchase(owner, { supplierId: sid, ingredientId: "kopi", qtyMilli: 1000, totalRp: 5 });
    expect(r).toMatchObject({ ok: false, code: "save_failed" });
    expect([db.purchases.length, db.costHistory.length, stockOf("kopi")]).toEqual([0, 0, 0]);
    expect(db.base.audit.filter((a) => a.action === "stock.purchase")).toHaveLength(0);
  });
});

describe("waste", () => {
  it("menurunkan stok dengan alasan", async () => {
    const r = await service.recordWaste(owner, { ingredientId: "susu", qtyMilli: 300, reason: " tumpah " });
    expect(r.ok && r.value).toMatchObject({ type: "waste", reason: "tumpah" });
    expect(stockOf("susu")).toBe(-300);
  });
  it.each([
    [{ qtyMilli: 0, reason: "x" }, "qtyMilli"],
    [{ qtyMilli: 10, reason: "  " }, "reason"],
    [{ qtyMilli: 10, reason: "a".repeat(201) }, "reason"],
  ])("menolak %j", async (input, field) => {
    const r = await service.recordWaste(owner, { ingredientId: "susu", ...input });
    expect(r.ok === false && r.fields).toHaveProperty(field);
    expect(db.movements).toHaveLength(0);
  });
});

describe("stocktake", () => {
  it("membuat penyesuaian hanya untuk selisih dan stok sama dengan hitungan fisik", async () => {
    const sid = await supplier();
    await service.recordPurchase(owner, { supplierId: sid, ingredientId: "kopi", qtyMilli: 5_000, totalRp: 1 });
    await service.recordPurchase(owner, { supplierId: sid, ingredientId: "susu", qtyMilli: 1_000, totalRp: 1 });
    const before = db.movements.length;
    const r = await service.completeStocktake(owner, { kopi: 4_200, susu: 1_000 });
    expect(r.ok && r.value.items).toEqual([{ ingredientId: "kopi", systemMilli: 5_000, countedMilli: 4_200 }, { ingredientId: "susu", systemMilli: 1_000, countedMilli: 1_000 }]);
    expect(db.movements.slice(before)).toMatchObject([{ ingredientId: "kopi", type: "adjustment_out", qtyMilli: 800 }]);
    expect([stockOf("kopi"), stockOf("susu")]).toEqual([4_200, 1_000]);
  });
  it("menolak hitungan negatif, bahan tidak dikenal, dan input kosong", async () => {
    expect((await service.completeStocktake(owner, { kopi: -1, nope: 1 })).ok === false).toBe(true);
    expect(await service.completeStocktake(owner, {})).toMatchObject({ code: "invalid_input" });
    expect(db.movements).toHaveLength(0);
  });
  it("membatalkan semua penyesuaian saat satu movement gagal", async () => {
    db.failMovements = true;
    expect(await service.completeStocktake(owner, { kopi: 10, susu: 20 })).toMatchObject({ code: "save_failed" });
    expect(db.stocktakes).toHaveLength(0);
  });
});

describe("stock alerts", () => {
  it("menandai stok menipis hanya untuk bahan berambang dan stok negatif", async () => {
    const sid = await supplier();
    await service.recordPurchase(owner, { supplierId: sid, ingredientId: "kopi", qtyMilli: 500_001, totalRp: 1 });
    expect(await service.lowStockAlerts()).toEqual([]);
    await service.recordWaste(owner, { ingredientId: "kopi", qtyMilli: 1, reason: "x" });
    expect((await service.lowStockAlerts()).map((s) => s.ingredientId)).toEqual(["kopi"]);
    await service.recordWaste(owner, { ingredientId: "susu", qtyMilli: 5, reason: "x" });
    const status = await service.stockStatus();
    expect(status.find((s) => s.ingredientId === "susu")).toMatchObject({ negative: true, low: false });
  });
});

describe("Property: ledger invariant (Req 8.5)", () => {
  const op = fc.oneof(
    fc.record({ kind: fc.constant("purchase" as const), id: fc.constantFrom("kopi", "susu"), qty: fc.integer({ min: 1, max: 100_000 }) }),
    fc.record({ kind: fc.constant("waste" as const), id: fc.constantFrom("kopi", "susu"), qty: fc.integer({ min: 1, max: 100_000 }) }),
    fc.record({ kind: fc.constant("count" as const), id: fc.constantFrom("kopi", "susu"), qty: fc.integer({ min: 0, max: 100_000 }) }),
  );
  it("stok sistem sama dengan jumlah movement setelah setiap transaksi, dan opname menyamakan stok dengan hitungan", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(op, { maxLength: 15 }), async (ops) => {
        db = createMemoryInventoryDb();
        seed();
        service = make();
        const sid = await supplier();
        for (const o of ops) {
          if (o.kind === "purchase") await service.recordPurchase(owner, { supplierId: sid, ingredientId: o.id, qtyMilli: o.qty, totalRp: o.qty });
          if (o.kind === "waste") await service.recordWaste(owner, { ingredientId: o.id, qtyMilli: o.qty, reason: "r" });
          if (o.kind === "count") {
            const r = await service.completeStocktake(owner, { [o.id]: o.qty });
            expect(r.ok).toBe(true);
            expect(stockOf(o.id)).toBe(o.qty);
          }
          for (const id of ["kopi", "susu"]) expect(stockOf(id)).toBe(ledger(id));
        }
      }),
      { numRuns: 60 },
    );
  });
});
