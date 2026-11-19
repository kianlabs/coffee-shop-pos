import { describe, expect, it } from "vitest";
import { defineSetting } from "@/domain/settings/registry";
import { minNotAboveMax, validateCross, validateValue } from "@/domain/settings/validate";

const pin = defineSetting({ key: "pin_panjang_min", type: "int", default: 4, min: 4, max: 12, auditable: true, requiresRestart: false });
const kasir = defineSetting({ key: "kasir_mode", type: "enum", default: "cepat", options: ["cepat", "lengkap"], auditable: false, requiresRestart: false });
const struk = defineSetting({ key: "struk_footer", type: "text", default: "", maxLength: 10, auditable: false, requiresRestart: false });
const cetak = defineSetting({ key: "cetak_otomatis", type: "bool", default: true, auditable: false, requiresRestart: false });

describe("validateValue", () => {
  it("int: bilangan bulat dalam rentang", () => {
    expect(validateValue(pin, 4)).toBeNull();
    expect(validateValue(pin, 12)).toBeNull();
    expect(validateValue(pin, 3)).toMatch(/antara 4 dan 12/);
    expect(validateValue(pin, 4.5)).toMatch(/bilangan bulat/);
    expect(validateValue(pin, "4")).toMatch(/bilangan bulat/);
  });

  it("bool, text, dan enum", () => {
    expect(validateValue(cetak, false)).toBeNull();
    expect(validateValue(cetak, "ya")).toMatch(/true atau false/);
    expect(validateValue(struk, "terima")).toBeNull();
    expect(validateValue(struk, "x".repeat(11))).toMatch(/maksimal 10/);
    expect(validateValue(kasir, "lengkap")).toBeNull();
    expect(validateValue(kasir, "lainnya")).toMatch(/salah satu dari/);
  });
});

describe("validasi lintas kunci", () => {
  const rules = [minNotAboveMax("pin_panjang_min", "pin_panjang_maks")];

  it("min tidak boleh lebih besar dari maks", () => {
    expect(validateCross(rules, { pin_panjang_min: 4, pin_panjang_maks: 8 })).toBeNull();
    expect(validateCross(rules, { pin_panjang_min: 9, pin_panjang_maks: 8 })).toMatch(/tidak boleh lebih besar/);
  });

  it("melewati aturan bila salah satu nilai belum ada", () => {
    expect(validateCross(rules, { pin_panjang_min: 9 })).toBeNull();
  });
});
