import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import type { ShiftPayment } from "@/domain/shifts";
import { SettingsService } from "@/services/settingsService";
import { ShiftService } from "@/services/shiftService";
import { createMemoryShiftDb, type MemoryShiftDb } from "@/testing/memory/shifts";
import { sequentialIds } from "@/testing/memory/settings";

const kasir = { id: "u-kasir", role: "kasir" } as const;
let db: MemoryShiftDb;
let nowIso: string;
let service: ShiftService;

function make(): ShiftService {
  const clock = { now: () => new Date(nowIso) };
  const settings = new SettingsService({ uow: db.base.uow, clock, ids: sequentialIds("s") });
  return new ShiftService({ uow: db.uow, settings, clock, ids: sequentialIds("sh") });
}
beforeEach(() => {
  db = createMemoryShiftDb();
  nowIso = "2026-11-19T08:00:00.000Z";
  service = make();
});

const pay = (amountRp: number, recordedAt: string, kind: ShiftPayment["kind"] = "sale", method = "cash"): ShiftPayment => ({ method, amountRp, recordedAt, kind });

describe("ShiftService.open", () => {
  it("menyimpan Shift terbuka dengan pembuka dan modal", async () => {
    const r = await service.open(kasir, 200_000);
    expect(r.ok && r.value).toMatchObject({ openedBy: "u-kasir", openCashRp: 200_000, status: "open", openedAt: nowIso });
    expect(db.base.audit.map((a) => a.action)).toEqual(["shift.open"]);
  });
  it("menolak Shift kedua selagi satu masih terbuka", async () => {
    await service.open(kasir, 0);
    const r = await service.open(kasir, 0);
    expect(r).toMatchObject({ ok: false, code: "already_open" });
    expect(db.shifts.size).toBe(1);
  });
  it("menolak dua pembukaan bersamaan", async () => {
    const results = await Promise.all([service.open(kasir, 0), service.open(kasir, 0)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
  it.each([-1, 1.5, 100_000_001, Number.NaN])("menolak modal %s", async (v) => {
    expect(await service.open(kasir, v)).toMatchObject({ ok: false, code: "invalid_input" });
    expect(db.shifts.size).toBe(0);
  });
  it("menerima batas 0 dan maksimum", async () => {
    expect((await service.open(kasir, 100_000_000)).ok).toBe(true);
  });
});

describe("ShiftService.recordCash", () => {
  it("menolak tanpa Shift terbuka", async () => {
    expect(await service.recordCash(kasir, { type: "cash_in", amountRp: 1000, reason: "x" })).toMatchObject({ ok: false, code: "no_open_shift" });
  });
  it("menyimpan entri dengan alasan dan pencatat", async () => {
    await service.open(kasir, 0);
    nowIso = "2026-11-19T09:00:00.000Z";
    const r = await service.recordCash(kasir, { type: "cash_out", amountRp: 5000, reason: " beli es " });
    expect(r.ok && r.value).toMatchObject({ type: "cash_out", amountRp: 5000, reason: "beli es", recordedBy: "u-kasir", recordedAt: nowIso });
  });
  it.each([
    [{ type: "cash_in", amountRp: 0, reason: "x" }, "nominal"],
    [{ type: "cash_in", amountRp: 100_000_001, reason: "x" }, "nominal"],
    [{ type: "cash_in", amountRp: 1.5, reason: "x" }, "nominal"],
    [{ type: "cash_out", amountRp: 10, reason: "   " }, "alasan"],
    [{ type: "cash_out", amountRp: 10, reason: "a".repeat(201) }, "alasan"],
  ] as const)("menolak %j dengan menyebut isian %s", async (input, field) => {
    await service.open(kasir, 0);
    const r = await service.recordCash(kasir, input);
    expect(r.ok === false && r.message).toContain(field);
    expect(db.entries).toHaveLength(0);
  });
});

describe("ShiftService.close", () => {
  async function openWithSales(): Promise<void> {
    await service.open(kasir, 100_000);
    db.payments.push(pay(50_000, "2026-11-19T08:30:00.000Z"), pay(20_000, "2026-11-19T08:40:00.000Z", "sale", "qris_manual"), pay(5_000, "2026-11-19T08:45:00.000Z", "refund"));
    db.payments.push(pay(9_999, "2026-11-19T07:00:00.000Z"));
    await service.recordCash(kasir, { type: "cash_in", amountRp: 10_000, reason: "tambah" });
    await service.recordCash(kasir, { type: "cash_out", amountRp: 3_000, reason: "parkir" });
    nowIso = "2026-11-19T17:00:00.000Z";
  }
  it("menutup tanpa alasan saat selisih nol dan membuat data Laporan Z", async () => {
    await openWithSales();
    const r = await service.close(kasir, { countedCashRp: 152_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cash).toMatchObject({ expectedCashRp: 152_000, cashSalesRp: 50_000, cashRefundsRp: 5_000 });
    expect(r.value.shift).toMatchObject({ status: "closed", closedBy: "u-kasir", differenceRp: 0, differenceReason: null });
    expect(r.value.salesByMethod).toEqual({ cash: 50_000, qris_manual: 20_000 });
    expect(await service.current()).toBeNull();
  });
  it("menolak selisih tanpa alasan dan Shift tetap terbuka", async () => {
    await openWithSales();
    const r = await service.close(kasir, { countedCashRp: 150_000 });
    expect(r).toMatchObject({ ok: false, code: "reason_required", differenceRp: -2_000 });
    expect((await service.current())?.shift.status).toBe("open");
  });
  it("menyimpan alasan selisih", async () => {
    await openWithSales();
    const r = await service.close(kasir, { countedCashRp: 153_000, differenceReason: "kembalian lebih" });
    expect(r.ok && r.value.shift).toMatchObject({ differenceRp: 1_000, differenceReason: "kembalian lebih", expectedCashRp: 152_000 });
  });
  it("menolak alasan terlalu panjang dan kas terhitung tidak valid", async () => {
    await openWithSales();
    expect(await service.close(kasir, { countedCashRp: 1, differenceReason: "a".repeat(201) })).toMatchObject({ code: "reason_required" });
    expect(await service.close(kasir, { countedCashRp: -1 })).toMatchObject({ code: "invalid_input" });
    expect(await service.close(kasir, { countedCashRp: 1_000_000_001 })).toMatchObject({ code: "invalid_input" });
  });
  it("menolak tanpa Shift terbuka", async () => {
    expect(await service.close(kasir, { countedCashRp: 0 })).toMatchObject({ code: "no_open_shift" });
  });
  it("mengembalikan save_failed dan membatalkan bila audit gagal", async () => {
    await service.open(kasir, 0);
    db.base.failAudit = true;
    expect(await service.close(kasir, { countedCashRp: 0 })).toMatchObject({ code: "save_failed" });
    expect((await service.current())?.shift.status).toBe("open");
  });
});

describe("ShiftService.current", () => {
  it("memulihkan Shift terbuka beserta entri kas", async () => {
    await service.open(kasir, 5_000);
    await service.recordCash(kasir, { type: "cash_in", amountRp: 1_000, reason: "a" });
    const restored = await make().current();
    expect(restored?.shift.openCashRp).toBe(5_000);
    expect(restored?.entries).toHaveLength(1);
  });
});

describe("Property 14: kas seharusnya saat Shift ditutup", () => {
  const amount = fc.integer({ min: 0, max: 5_000_000 });
  it("sama dengan modal + tunai + masuk − keluar − refund tunai, hanya dalam rentang waktu", async () => {
    await fc.assert(
      fc.asyncProperty(
        amount, fc.array(amount, { maxLength: 6 }), fc.array(amount, { maxLength: 4 }), fc.array(amount, { maxLength: 4 }), fc.array(amount, { maxLength: 4 }), fc.array(amount, { maxLength: 3 }),
        async (open, sales, ins, outs, refunds, outside) => {
          db = createMemoryShiftDb();
          nowIso = "2026-11-19T08:00:00.000Z";
          service = make();
          await service.open(kasir, open);
          sales.forEach((a) => db.payments.push(pay(a, "2026-11-19T10:00:00.000Z")));
          refunds.forEach((a) => db.payments.push(pay(a, "2026-11-19T11:00:00.000Z", "refund")));
          outside.forEach((a) => db.payments.push(pay(a, "2026-11-18T10:00:00.000Z")));
          for (const a of ins.filter((v) => v > 0)) await service.recordCash(kasir, { type: "cash_in", amountRp: a, reason: "m" });
          for (const a of outs.filter((v) => v > 0)) await service.recordCash(kasir, { type: "cash_out", amountRp: a, reason: "k" });
          nowIso = "2026-11-19T20:00:00.000Z";
          const sum = (xs: number[]): number => xs.reduce((s, v) => s + v, 0);
          const expected = open + sum(sales) + sum(ins) - sum(outs) - sum(refunds);
          const r = await service.close(kasir, { countedCashRp: Math.min(Math.max(expected, 0), 1_000_000_000), differenceReason: "tes" });
          expect(r.ok && r.value.cash.expectedCashRp).toBe(expected);
        },
      ),
      { numRuns: 60 },
    );
  });
});
