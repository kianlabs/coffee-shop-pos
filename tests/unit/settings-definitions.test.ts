import { describe, expect, it } from "vitest";
import { CROSS_RULES, SETTINGS, defaultSettings, settingByKey, type SettingKey } from "@/domain/settings/definitions";
import { validateCross, validateValue } from "@/domain/settings/validate";

describe("definisi pengaturan", () => {
  it("kunci unik dan setiap definisi punya label id dan en", () => {
    const keys = SETTINGS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of SETTINGS) {
      expect(s.label.id.length).toBeGreaterThan(0);
      expect(s.label.en.length).toBeGreaterThan(0);
    }
  });

  it("setiap nilai default valid terhadap definisinya", () => {
    for (const s of SETTINGS) {
      expect(validateValue(s, s.default), s.key).toBeNull();
    }
  });

  it("default lintas kunci lolos aturan lintas kunci", () => {
    expect(validateCross(CROSS_RULES, defaultSettings())).toBeNull();
  });

  it("kunci yang tidak terdaftar tidak ditemukan", () => {
    expect(settingByKey("tidak_ada")).toBeUndefined();
    expect(settingByKey("pin_panjang_min")?.type).toBe("int");
  });

  it("kunci tidak terdaftar ditandai dengan @ts-expect-error (tsc tidak memeriksa tests/)", () => {
    // @ts-expect-error kunci ini sengaja tidak terdaftar
    const invalid: SettingKey = "tidak_ada";
    expect(invalid).toBe("tidak_ada");
  });
});
