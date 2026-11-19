import { describe, expect, it } from "vitest";
import { categoryTone, monogram } from "@/features/kasir/categoryColor";

describe("categoryTone", () => {
  it("berputar setiap enam kategori dan aman untuk indeks negatif", () => {
    expect(categoryTone(0).bg).toBe("bg-cat-1");
    expect(categoryTone(6).bg).toBe("bg-cat-1");
    expect(categoryTone(4).text).toBe("text-cat-5");
    expect(categoryTone(-1).bg).toBe("bg-cat-1");
  });
});

describe("monogram", () => {
  it("mengambil huruf awal dua kata pertama", () => {
    expect(monogram("Es Kopi Aren")).toBe("EK");
    expect(monogram("latte")).toBe("L");
    expect(monogram("08.20 Escobar")).toBe("E");
    expect(monogram("7 11")).toBe("71");
    expect(monogram("  (Promo) Teh Manis ")).toBe("PT");
    expect(monogram("")).toBe("");
  });
});
