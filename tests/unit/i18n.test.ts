import { afterEach, describe, expect, it } from "vitest";
import { formatDateTime, formatMoney, getLocale, setLocale, t } from "@/services/i18n";

afterEach(() => setLocale("id"));

describe("t", () => {
  it("memakai bahasa aktif dan bisa diganti", () => {
    expect(t("nav.cashier")).toBe("Kasir");
    setLocale("en");
    expect(t("nav.cashier")).toBe("Cashier");
    expect(getLocale()).toBe("en");
  });

  it("jatuh ke Bahasa Indonesia lalu ke nama kunci", () => {
    expect(t("nav.cashier", {}, "en")).toBe("Cashier");
    expect(t("tidak.ada.kunci", {}, "en")).toBe("tidak.ada.kunci");
    expect(t("tidak.ada.kunci")).toBe("tidak.ada.kunci");
  });

  it("mengganti parameter {nama} dan membiarkan yang tidak dikenal", () => {
    const original = t("common.save");
    expect(original).toBe("Simpan");
    // Parameter lewat kunci yang tidak ada: placeholder tetap utuh.
    expect(t("error.generic", { nama: "x" })).toBe("Terjadi kesalahan. Coba lagi.");
  });
});

describe("formatDateTime", () => {
  it("menulis DD/MM/YYYY HH:mm dengan jam 24 jam", () => {
    expect(formatDateTime(new Date(2026, 10, 9, 7, 5))).toBe("09/11/2026 07:05");
    expect(formatDateTime(new Date(2026, 0, 31, 23, 59))).toBe("31/01/2026 23:59");
  });
});

describe("formatMoney", () => {
  it("memakai pemisah titik untuk id dan koma untuk en", () => {
    expect(formatMoney(25000, "id")).toBe("Rp 25.000");
    expect(formatMoney(25000, "en")).toBe("Rp 25,000");
    expect(formatMoney(1234567, "id")).toBe("Rp 1.234.567");
    expect(formatMoney(0)).toBe("Rp 0");
  });

  it("menangani nilai negatif dan membulatkan ke rupiah utuh", () => {
    expect(formatMoney(-5000, "id")).toBe("-Rp 5.000");
    expect(formatMoney(999.6, "en")).toBe("Rp 1,000");
  });
});
