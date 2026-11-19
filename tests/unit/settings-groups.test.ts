import { describe, expect, it } from "vitest";
import {
  CROSS_RULES,
  SETTINGS,
  defaultSettings,
  isSettingKey,
  settingsInGroup,
} from "@/domain/settings/definitions";
import { AUDITED_GROUPS, defineSetting, type SettingGroup } from "@/domain/settings/registry";
import { validateCross, validateValue } from "@/domain/settings/validate";

const meta = { group: "kasir", label: { id: "x", en: "x" }, help: { id: "x", en: "x" }, auditable: false, requiresRestart: false } as const;

describe("grup pengaturan (7.2)", () => {
  it("setiap definisi punya bantuan id dan en", () => {
    for (const s of SETTINGS) {
      expect(s.help.id.length, s.key).toBeGreaterThan(0);
      expect(s.help.en.length, s.key).toBeGreaterThan(0);
    }
  });

  it("auditable tepat untuk grup pajak, diskon, pembayaran, shift, stok, keamanan, backup", () => {
    for (const s of SETTINGS) expect(s.auditable, s.key).toBe(AUDITED_GROUPS.includes(s.group));
  });

  it("setiap grup layar kecuali toko punya minimal satu kunci", () => {
    const groups: SettingGroup[] = ["kasir", "pajak", "pembayaran", "diskon", "struk", "printer", "stok", "shift", "keamanan", "backup", "sinkronisasi", "bahasa", "tampilan"];
    for (const g of groups) expect(settingsInGroup(g).length, g).toBeGreaterThan(0);
  });

  it("memuat kunci yang disebut requirements dengan default dan rentangnya", () => {
    const d = defaultSettings();
    expect(d["kasir.alasan_maks_karakter"]).toBe(200);
    expect(d["katalog.harga_maks_rupiah"]).toBe(99_999_999);
    expect(d["fnb.nomor_antrean_jam_reset"]).toBe("00:00");
    expect(d["pembayaran.metode_aktif"]).toEqual(["cash", "qris_manual", "card_edc", "bank_transfer", "other"]);
    expect(d["pelanggan.telepon_digit_min"]).toBe(8);
    expect(d["sinkronisasi.jeda_maks_detik"]).toBe(3600);
    expect(d["pembaruan.otomatis"]).toBe(true);
    expect(isSettingKey("katalog.nama_maks_karakter")).toBe(true);
    expect(isSettingKey("nama_maks_karakter")).toBe(false);
  });

  it("kunci perlu mulai ulang ditandai", () => {
    expect(SETTINGS.filter((s) => s.requiresRestart).map((s) => s.key)).toEqual(["pembaruan.interval_jam"]);
  });
});

describe("validator tambahan", () => {
  it("int dengan daftar nilai yang diizinkan", () => {
    const def = defineSetting({ ...meta, key: "k", type: "int", default: 100, min: 100, max: 1000, allowed: [100, 500, 1000] });
    expect(validateValue(def, 500)).toBeNull();
    expect(validateValue(def, 250)).toMatch(/salah satu dari: 100, 500, 1000/);
  });

  it("teks format jam JJ:mm", () => {
    const def = defineSetting({ ...meta, key: "k", type: "text", default: "00:00", maxLength: 5, format: "time" });
    expect(validateValue(def, "23:59")).toBeNull();
    expect(validateValue(def, "24:00")).toMatch(/JJ:mm/);
    expect(validateValue(def, "7:30")).toMatch(/JJ:mm/);
  });

  it("daftar pilihan: anggota opsi, unik, dan minimal satu", () => {
    const def = defineSetting({ ...meta, key: "k", type: "multi", default: ["a"], options: ["a", "b"], minSelected: 1 });
    expect(validateValue(def, ["b", "a"])).toBeNull();
    expect(validateValue(def, [])).toMatch(/minimal 1/);
    expect(validateValue(def, ["a", "a"])).toMatch(/ganda/);
    expect(validateValue(def, ["c"])).toMatch(/daftar dari: a, b/);
    expect(validateValue(def, "a")).toMatch(/daftar dari/);
  });

  it("aturan lintas kunci untuk PIN, jeda sinkronisasi, dan digit telepon", () => {
    const base = defaultSettings();
    expect(validateCross(CROSS_RULES, { ...base, "keamanan.pin_panjang_min": 6, "keamanan.pin_panjang_maks": 5 })).toMatch(/pin_panjang_min/);
    expect(validateCross(CROSS_RULES, { ...base, "sinkronisasi.jeda_dasar_detik": 61, "sinkronisasi.jeda_maks_detik": 60 })).toMatch(/jeda_dasar_detik/);
    expect(validateCross(CROSS_RULES, { ...base, "pelanggan.telepon_digit_min": 11, "pelanggan.telepon_digit_maks": 10 })).toMatch(/telepon_digit_min/);
  });
});
