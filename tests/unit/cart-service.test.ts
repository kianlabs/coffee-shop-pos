import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { computeTotals, NO_PROMO, type TaxConfig } from "@/domain/taxEngine";
import { CartService, type AddItemInput, type Scheduler } from "@/services/cartService";
import { SettingsService } from "@/services/settingsService";
import { createMemoryShiftDb, type MemoryShiftDb } from "@/testing/memory/shifts";
import { sequentialIds } from "@/testing/memory/settings";

const user = { id: "u1" };
const cfg: TaxConfig = { taxMode: "exclusive", taxRateBp: 1100, taxBase: "after_discount", serviceEnabled: true, serviceRateBp: 500, roundingStep: 100 };
const item = (productId: string, qty = 1, extra: Partial<AddItemInput> = {}): AddItemInput => ({
  productId, variantId: null, modifierIds: [], name: productId, unitPriceRp: 18_000, adjustmentsRp: 0, qty, ...extra,
});

let db: MemoryShiftDb;
let service: CartService;
let warnings: string[];
let pending: Array<() => void>;
const scheduler: Scheduler = {
  set: (fn) => {
    pending.push(fn);
    return pending.length - 1;
  },
  clear: (h) => {
    pending[h as number] = () => undefined;
  },
};

function make(): CartService {
  const clock = { now: () => new Date("2026-11-19T08:00:00.000Z") };
  const settings = new SettingsService({ uow: db.base.uow, clock, ids: sequentialIds("s") });
  return new CartService({ uow: db.uow, settings, clock, ids: sequentialIds("h"), scheduler, onWarning: (m) => warnings.push(m) });
}
beforeEach(() => {
  db = createMemoryShiftDb();
  warnings = [];
  pending = [];
  service = make();
});

describe("CartService edits", () => {
  it("menambah, menggabungkan baris sama, mengubah jumlah, dan menghapus", () => {
    service.addItem(item("kopi", 1));
    service.addItem(item("kopi", 2));
    service.addItem(item("teh", 1, { modifierIds: ["b", "a"] }));
    expect(service.state.lines.map((l) => [l.key, l.qty])).toEqual([["kopi||", 3], ["teh||a,b", 1]]);
    expect(service.setQty("kopi||", 5).ok).toBe(true);
    expect(service.setQty("kopi||", 0)).toMatchObject({ ok: false, code: "invalid_input" });
    expect(service.removeItem("teh||a,b").ok).toBe(true);
    expect(service.removeItem("tidak-ada")).toMatchObject({ code: "not_found" });
    expect(service.state.lines).toHaveLength(1);
  });
  it("memakai dine_in sebagai default dan menghapus meja saat tipe berganti", () => {
    expect(service.state.orderType).toBe("dine_in");
    expect(service.setTable("A12").ok).toBe(true);
    service.setOrderType("takeaway");
    expect(service.state.tableNo).toBe("");
    expect(service.setTable("A1")).toMatchObject({ ok: false });
  });
  it("memvalidasi nomor meja, nama pelanggan, dan catatan", () => {
    expect(service.setTable("A-1")).toMatchObject({ ok: false });
    expect(service.setTable("1".repeat(11))).toMatchObject({ ok: false });
    expect(service.setCustomerName("x".repeat(51))).toMatchObject({ ok: false });
    expect(service.addItem(item("kopi", 1, { note: "n".repeat(201) }))).toMatchObject({ ok: false });
    expect(service.state.lines).toHaveLength(0);
  });
  it("menghitung total lewat computeTotals", () => {
    service.addItem(item("kopi", 3));
    service.setOrderDiscount({ kind: "percent", bp: 1000 });
    const expected = computeTotals([{ key: "kopi||", unitPriceRp: 18_000, adjustmentsRp: 0, qty: 3 }], { kind: "percent", bp: 1000 }, NO_PROMO, cfg);
    expect(service.totals(cfg)).toEqual(expected);
  });
});

describe("CartService persistence", () => {
  it("menyimpan setelah jeda debounce dan hanya sekali per rangkaian perubahan", async () => {
    service.addItem(item("kopi"));
    service.setQty("kopi||", 2);
    expect(db.cart).toBeNull();
    pending.forEach((f) => f());
    await service.flush();
    expect(db.cart?.lines[0].qty).toBe(2);
  });
  it("pulih setelah restart dengan isi identik", async () => {
    service.addItem(item("kopi", 2, { note: "less sugar" }));
    service.setCustomerName("Sari");
    await service.flush();
    const again = make();
    await again.load();
    expect(again.state).toEqual(service.state);
  });
  it("kegagalan simpan hanya memberi peringatan dan cart tetap di memori", async () => {
    db.failCartSave = true;
    service.addItem(item("kopi"));
    await service.flush();
    expect(warnings).toHaveLength(1);
    expect(service.state.lines).toHaveLength(1);
  });
  it("cart kosong menghapus cart tersimpan", async () => {
    service.addItem(item("kopi"));
    await service.flush();
    service.removeItem("kopi||");
    await service.flush();
    expect(db.cart).toBeNull();
  });
});

describe("CartService hold and restore", () => {
  it("menolak menahan cart kosong", async () => {
    expect(await service.hold(user)).toMatchObject({ ok: false, code: "empty_cart" });
  });
  it("menahan dengan label nama, meja, lalu Pesanan N berurutan, dan mengosongkan cart", async () => {
    service.addItem(item("a"));
    service.setCustomerName("Sari");
    service.setTable("7");
    const r1 = await service.hold(user);
    expect(r1.ok && r1.held.label).toBe("Sari");
    expect(service.state.lines).toHaveLength(0);
    service.addItem(item("a"));
    service.setTable("7");
    expect((await service.hold(user) as { held: { label: string } }).held.label).toBe("7");
    for (const expected of ["Pesanan 1", "Pesanan 2"]) {
      service.addItem(item("a"));
      expect((await service.hold(user) as { held: { label: string } }).held.label).toBe(expected);
    }
  });
  it("menolak saat batas pesanan ditahan tercapai dan cart tidak berubah", async () => {
    for (let i = 0; i < 20; i++) {
      service.addItem(item("a"));
      expect((await service.hold(user)).ok).toBe(true);
    }
    service.addItem(item("b"));
    const r = await service.hold(user);
    expect(r).toMatchObject({ ok: false, code: "held_limit" });
    expect(service.state.lines).toHaveLength(1);
    expect(db.held.size).toBe(20);
  });
  it("gagal simpan menahan cart tetap utuh", async () => {
    service.addItem(item("a"));
    db.failHold = true;
    expect(await service.hold(user)).toMatchObject({ ok: false, code: "save_failed" });
    expect(service.state.lines).toHaveLength(1);
    expect(db.held.size).toBe(0);
  });
  it("meminta pilihan bila cart aktif berisi item, lalu menahan atau membuang", async () => {
    service.addItem(item("a"));
    const held = await service.hold(user);
    const id = held.ok ? held.held.id : "";
    service.addItem(item("b"));
    expect(await service.restore(user, id)).toMatchObject({ ok: false, code: "active_cart_not_empty" });
    expect(db.held.size).toBe(1);
    const r = await service.restore(user, id, "hold_current");
    expect(r.ok).toBe(true);
    expect(service.state.lines.map((l) => l.productId)).toEqual(["a"]);
    expect([...db.held.values()].map((h) => h.cart.lines[0].productId)).toEqual(["b"]);
    expect((await service.restore(user, [...db.held.keys()][0], "discard_current")).ok).toBe(true);
    expect(service.state.lines[0].productId).toBe("b");
    expect(db.held.size).toBe(0);
  });
  it("pesanan tidak ditemukan", async () => {
    expect(await service.restore(user, "nope")).toMatchObject({ code: "not_found" });
  });
  it("pesanan ditahan tetap ada bila pemulihan gagal", async () => {
    service.addItem(item("a"));
    const held = await service.hold(user);
    db.failCartSave = true;
    expect(await service.restore(user, held.ok ? held.held.id : "")).toMatchObject({ ok: false, code: "save_failed" });
    expect(db.held.size).toBe(1);
    expect(service.state.lines).toHaveLength(0);
  });
});

describe("Property: tahan lalu lanjutkan memulihkan nilai identik", () => {
  const line = fc.record({
    productId: fc.constantFrom("kopi", "teh", "roti"),
    modifierIds: fc.subarray(["m1", "m2", "m3"]),
    qty: fc.integer({ min: 1, max: 20 }),
    note: fc.string({ maxLength: 30 }),
  });
  it("cart setelah restore sama dengan sebelum ditahan", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(line, { minLength: 1, maxLength: 6 }), fc.constantFrom("dine_in", "takeaway", "delivery"), fc.string({ maxLength: 20 }), async (lines, type, name) => {
        db = createMemoryShiftDb();
        service = make();
        for (const l of lines) service.addItem(item(l.productId, l.qty, { modifierIds: l.modifierIds, note: l.note }));
        service.setOrderType(type);
        service.setCustomerName(name);
        service.setOrderDiscount({ kind: "amount", rp: 500 });
        const before = service.state;
        const held = await service.hold(user);
        expect(held.ok).toBe(true);
        const back = await service.restore(user, held.ok ? held.held.id : "");
        expect(back.ok && back.cart).toEqual(before);
        expect(db.held.size).toBe(0);
      }),
      { numRuns: 50 },
    );
  });
});
