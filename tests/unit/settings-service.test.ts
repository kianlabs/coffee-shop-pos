import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsService, type SettingsActor } from "@/services/settingsService";
import { createMemorySettingsDb, fixedClock, sequentialIds, type MemorySettingsDb } from "@/testing/memory/settings";

const owner: SettingsActor = { id: "u-owner", role: "owner" };
let db: MemorySettingsDb;
let service: SettingsService;

beforeEach(async () => {
  db = createMemorySettingsDb();
  service = new SettingsService({ uow: db.uow, clock: fixedClock(), ids: sequentialIds("audit") });
  await service.load();
});

describe("SettingsService", () => {
  it("get sinkron mengembalikan default sebelum ada perubahan", () => {
    expect(service.get("keamanan.maks_percobaan_pin")).toBe(5);
    expect(service.get("pajak.mode")).toBe("off");
  });

  it("owner menyimpan nilai, cache dan baris JSON berubah, audit tercatat untuk grup pajak", async () => {
    const result = await service.set("pajak.tarif_bp", 1100, owner);
    expect(result).toEqual({ ok: true, changed: ["pajak.tarif_bp"] });
    expect(service.get("pajak.tarif_bp")).toBe(1100);
    expect(db.rows.get("pajak.tarif_bp")).toEqual({ json: "1100", updatedAt: "2026-11-19T00:00:00.000Z", updatedBy: "u-owner" });
    expect(db.audit).toEqual([expect.objectContaining({ id: "audit-1", entityType: "setting", entityId: "pajak.tarif_bp", before: 0, after: 1100, action: "setting.update", actionType: "change_setting", actorId: "u-owner" })]);
  });

  it("grup keamanan memakai jenis aksi change_security_setting", async () => {
    await service.set("keamanan.idle_kunci_menit", 15, owner);
    expect(db.audit[0]?.actionType).toBe("change_security_setting");
  });

  it("grup tanpa audit (printer) tidak menulis audit_logs", async () => {
    await service.set("printer.lebar_kertas", "80mm", owner);
    expect(db.audit).toEqual([]);
    expect(service.get("printer.lebar_kertas")).toBe("80mm");
  });

  it.each(["supervisor", "kasir"] as const)("%s ditolak tanpa mengubah nilai", async (role) => {
    const result = await service.set("pajak.tarif_bp", 1100, { id: "u", role });
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
    expect(await service.reset(["pajak.tarif_bp"], { id: "u", role })).toMatchObject({ ok: false, code: "forbidden" });
    expect(service.get("pajak.tarif_bp")).toBe(0);
    expect(db.rows.size).toBe(0);
  });

  it("nilai di luar rentang ditolak dengan pesan rentang", async () => {
    const result = await service.setMany({ "pajak.tarif_bp": 10_001 }, owner);
    expect(result).toMatchObject({ ok: false, code: "invalid", message: expect.stringMatching(/antara 0 dan 10000/) });
    expect(service.get("pajak.tarif_bp")).toBe(0);
  });

  it("kunci tidak terdaftar ditolak", async () => {
    expect(await service.setMany({ tidak_ada: 1 }, owner)).toMatchObject({ ok: false, code: "unknown_key" });
    expect(await service.reset(["tidak_ada"], owner)).toMatchObject({ ok: false, code: "unknown_key" });
  });

  it("aturan lintas kunci: min tidak boleh melewati maks, tapi pasangan bisa diubah bersama", async () => {
    expect(await service.set("keamanan.pin_panjang_min", 6, owner)).toMatchObject({ ok: true });
    expect(await service.set("keamanan.pin_panjang_maks", 5, owner)).toMatchObject({ ok: false, code: "invalid" });
    expect(await service.setMany({ "keamanan.pin_panjang_min": 4, "keamanan.pin_panjang_maks": 5 }, owner)).toMatchObject({ ok: true });
    expect(service.get("keamanan.pin_panjang_maks")).toBe(5);
  });

  it("gagal audit membatalkan perubahan dan mempertahankan nilai lama", async () => {
    db.failAudit = true;
    const result = await service.setMany({ "printer.lebar_kertas": "80mm", "pajak.tarif_bp": 500 }, owner);
    expect(result).toMatchObject({ ok: false, code: "audit_failed", message: expect.stringMatching(/gagal dicatat/) });
    expect(service.get("pajak.tarif_bp")).toBe(0);
    expect(service.get("printer.lebar_kertas")).toBe("58mm");
    expect(db.rows.size).toBe(0);
  });

  it("gagal menulis pengaturan memberi save_failed", async () => {
    db.failWrites = true;
    expect(await service.set("printer.lebar_kertas", "80mm", owner)).toMatchObject({ ok: false, code: "save_failed" });
    expect(service.get("printer.lebar_kertas")).toBe("58mm");
  });

  it("nilai sama tidak menulis apa pun", async () => {
    expect(await service.set("pajak.tarif_bp", 0, owner)).toEqual({ ok: true, changed: [] });
    expect(db.rows.size).toBe(0);
    expect(db.audit).toEqual([]);
  });

  it("reset mengembalikan default, menghapus baris, dan mengaudit nilai yang berubah", async () => {
    await service.setMany({ "pajak.tarif_bp": 1100, "printer.timeout_cetak_detik": 30 }, owner);
    const result = await service.reset(["pajak.tarif_bp", "printer.timeout_cetak_detik", "pajak.mode"], owner);
    expect(result).toEqual({ ok: true, changed: ["pajak.tarif_bp", "printer.timeout_cetak_detik"] });
    expect(service.get("pajak.tarif_bp")).toBe(0);
    expect(db.rows.size).toBe(0);
    expect(db.audit.map((a) => [a.action, a.entityId])).toEqual([
      ["setting.update", "pajak.tarif_bp"],
      ["setting.reset", "pajak.tarif_bp"],
    ]);
  });

  it("subscriber menerima kunci yang berubah; berhenti setelah unsubscribe; error subscriber tidak menggagalkan", async () => {
    const seen = vi.fn();
    const off = service.subscribe(seen);
    service.subscribe(() => {
      throw new Error("rusak");
    });
    expect(await service.set("tampilan.durasi_toast_detik", 5, owner)).toMatchObject({ ok: true });
    expect(seen).toHaveBeenCalledWith(["tampilan.durasi_toast_detik"], expect.objectContaining({ "tampilan.durasi_toast_detik": 5 }));
    off();
    await service.set("tampilan.durasi_toast_detik", 6, owner);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("load memakai nilai tersimpan dan mengabaikan nilai rusak, kunci asing, dan pelanggaran lintas kunci", async () => {
    await service.set("struk.footer", "Terima kasih", owner);
    db.rows.set("pajak.tarif_bp", { json: "99999", updatedAt: "", updatedBy: "" });
    db.rows.set("kunci.lama", { json: "1", updatedAt: "", updatedBy: "" });
    db.rows.set("keamanan.pin_panjang_min", { json: "6", updatedAt: "", updatedBy: "" });
    db.rows.set("keamanan.pin_panjang_maks", { json: "5", updatedAt: "", updatedBy: "" });
    const fresh = new SettingsService({ uow: db.uow, clock: fixedClock(), ids: sequentialIds() });
    await fresh.load();
    expect(fresh.get("struk.footer")).toBe("Terima kasih");
    expect(fresh.get("pajak.tarif_bp")).toBe(0);
    expect(fresh.get("keamanan.pin_panjang_min")).toBe(6);
    expect(fresh.get("keamanan.pin_panjang_maks")).toBe(6);
  });

  it("operasi paralel diproses berurutan sehingga validasi lintas kunci melihat hasil sebelumnya", async () => {
    const [a, b] = await Promise.all([
      service.set("keamanan.pin_panjang_min", 6, owner),
      service.set("keamanan.pin_panjang_maks", 5, owner),
    ]);
    expect(a).toMatchObject({ ok: true });
    expect(b).toMatchObject({ ok: false, code: "invalid" });
  });
});
