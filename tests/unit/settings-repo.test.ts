import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8 } from "@/data/migrations";
import { createUnitOfWork } from "@/data/unitOfWork";
import { SettingsService } from "@/services/settingsService";
import { fixedClock, sequentialIds } from "@/testing/memory/settings";
import { openSqlJsDb } from "@/testing/sqlJsDb";

type Db = Awaited<ReturnType<typeof openSqlJsDb>>;
const owner = { id: "u-owner", role: "owner" } as const;
let db: Db;

function service(): SettingsService {
  return new SettingsService({ uow: createUnitOfWork(db), clock: fixedClock(), ids: sequentialIds("audit") });
}

beforeEach(async () => {
  db = await openSqlJsDb();
  for (const batch of [UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8]) {
    for (const s of batch) await db.exec(s);
  }
});
afterEach(() => db.close());

describe("SettingsRepo di sql.js (V1..V8)", () => {
  it("menyimpan nilai sebagai JSON dengan updated_by dan tetap berlaku setelah dibuka ulang", async () => {
    const s = service();
    await s.load();
    expect(await s.setMany({ "pajak.tarif_bp": 1100, "pembayaran.metode_aktif": ["tunai", "qris"], "struk.footer": "Terima kasih" }, owner)).toMatchObject({ ok: true });
    const rows = await db.query("SELECT key, value, updated_at, updated_by FROM app_settings ORDER BY key");
    expect(rows).toEqual([
      { key: "pajak.tarif_bp", value: "1100", updated_at: "2026-11-19T00:00:00.000Z", updated_by: "u-owner" },
      { key: "pembayaran.metode_aktif", value: '["tunai","qris"]', updated_at: "2026-11-19T00:00:00.000Z", updated_by: "u-owner" },
      { key: "struk.footer", value: '"Terima kasih"', updated_at: "2026-11-19T00:00:00.000Z", updated_by: "u-owner" },
    ]);
    const reopened = service();
    await reopened.load();
    expect(reopened.get("pajak.tarif_bp")).toBe(1100);
    expect(reopened.get("pembayaran.metode_aktif")).toEqual(["tunai", "qris"]);
    expect(reopened.get("struk.footer")).toBe("Terima kasih");
  });

  it("menulis audit_logs dengan kolom V8 dalam transaksi yang sama", async () => {
    const s = service();
    await s.set("keamanan.maks_percobaan_pin", 3, owner);
    const audit = await db.query("SELECT id, actor_id, approver_id, action, action_type, entity_type, entity_id, before_json, after_json, reason, created_at FROM audit_logs");
    expect(audit).toEqual([{
      id: "audit-1", actor_id: "u-owner", approver_id: null, action: "setting.update", action_type: "change_security_setting",
      entity_type: "setting", entity_id: "keamanan.maks_percobaan_pin", before_json: "5", after_json: "3", reason: null,
      created_at: "2026-11-19T00:00:00.000Z",
    }]);
  });

  it("membatalkan perubahan bila insert audit gagal", async () => {
    const s = service();
    await s.set("pajak.tarif_bp", 500, owner);
    await db.exec("CREATE TRIGGER t_fail BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit rusak'); END;");
    const result = await s.setMany({ "printer.lebar_kertas": "80mm", "pajak.tarif_bp": 1100 }, owner);
    expect(result).toMatchObject({ ok: false, code: "audit_failed" });
    expect(s.get("pajak.tarif_bp")).toBe(500);
    expect(await db.query("SELECT key, value FROM app_settings ORDER BY key")).toEqual([{ key: "pajak.tarif_bp", value: "500" }]);
    expect(await db.query("SELECT count(*) AS n FROM audit_logs")).toEqual([{ n: 1 }]);
  });

  it("reset menghapus baris dalam satu transaksi dan mencatat audit", async () => {
    const s = service();
    await s.setMany({ "pajak.tarif_bp": 1100, "printer.timeout_cetak_detik": 30 }, owner);
    expect(await s.reset(["pajak.tarif_bp", "printer.timeout_cetak_detik"], owner)).toMatchObject({ ok: true });
    expect(await db.query("SELECT key FROM app_settings")).toEqual([]);
    expect(await db.query("SELECT action, entity_id, before_json, after_json FROM audit_logs WHERE action = 'setting.reset'")).toEqual([
      { action: "setting.reset", entity_id: "pajak.tarif_bp", before_json: "1100", after_json: "0" },
    ]);
  });

  it("membaca baris teks lama yang bukan JSON sebagai string dan mengabaikan kunci asing", async () => {
    await db.run("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?), (?, ?, ?)", [
      "struk.header", "Kopi Enak", "2026-01-01", "toko.nama", "Toko", "2026-01-01",
    ]);
    const s = service();
    await s.load();
    expect(s.get("struk.header")).toBe("Kopi Enak");
  });
});
