import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECEIPT_LABELS, formatKitchenTicket, formatReceipt, sanitize, twoColumn, wrap,
  type ReceiptContext, type ReceiptOrder,
} from "@/domain/receipt";
import { DEFAULT_STORE_PROFILE } from "@/domain/storeProfile";

const store = { ...DEFAULT_STORE_PROFILE, name: "Kopi Suro", address: "Jl. Mawar 1", npwp: "01.234" };
const ctx = (over: Partial<ReceiptContext> = {}): ReceiptContext => ({
  widthChars: 32, lang: "id", store, contributors: [], ...over,
});
const order: ReceiptOrder = {
  receiptNumber: "R-001", createdAt: new Date(2024, 0, 5, 9, 7), cashierName: "Ani",
  orderType: "Makan di tempat", status: "completed",
  lines: [{ name: "Kopi Susu", variantName: "Large", qty: 2, unitPriceRp: 18000, lineTotalRp: 36000,
    modifiers: [{ name: "Extra shot", deltaRp: 3000 }, { name: "Less ice", deltaRp: 0 }] }],
  subtotalRp: 36000, discountRp: 1000, serviceChargeRp: 500, taxRp: 3850, roundingRp: -50,
  totalRp: 39300, payments: [{ method: "cash", amountRp: 40000 }], changeRp: 700, notes: "tanpa gula",
};

describe("sanitize", () => {
  it("removes C0 controls and DEL", () => {
    expect(sanitize("a\u001b@b\u0000c\u007fd\n\te")).toBe("a@bcde");
  });
});

describe("wrap", () => {
  it("wraps at spaces", () => {
    expect(wrap("aaa bbb ccc", 7)).toEqual(["aaa bbb", "ccc"]);
  });
  it("force-breaks long tokens by code point", () => {
    expect(wrap("😀😀😀😀😀", 2)).toEqual(["😀😀", "😀😀", "😀"]);
  });
  it("returns no lines for blank text", () => {
    expect(wrap("   ", 10)).toEqual([]);
  });
});

describe("twoColumn", () => {
  it("right-aligns the amount", () => {
    expect(twoColumn("Total", "Rp1.000", 16)).toEqual(["Total    Rp1.000"]);
  });
  it("wraps left and keeps the amount whole", () => {
    const rows = twoColumn("Es kopi susu gula aren", "Rp18.000", 20);
    expect(rows.every((r) => Array.from(r).length <= 20)).toBe(true);
    expect(rows[rows.length - 1]?.endsWith("Rp18.000")).toBe(true);
  });
  it("puts the amount alone when there is no room", () => {
    expect(twoColumn("Abc", "Rp1.234.567", 12)).toEqual(["Abc", " Rp1.234.567"]);
  });
  it("prints a lone amount for empty left", () => {
    expect(twoColumn("", "Rp1", 6)).toEqual(["   Rp1"]);
  });
  it("keeps indent and omits empty amount", () => {
    expect(twoColumn("  + Less ice", "", 32)).toEqual(["  + Less ice"]);
  });
});

describe("formatReceipt", () => {
  it("renders a full 32 column receipt", () => {
    const rows = formatReceipt(order, ctx());
    expect(rows).toMatchSnapshot();
    expect(rows.every((r) => r.length <= 32)).toBe(true);
    expect(rows).toContain("Tgl: 05/01/2024 09:07");
  });
  it("uses 48 columns and English labels/separators", () => {
    const rows = formatReceipt(order, ctx({ widthChars: 48, lang: "en" }));
    expect(rows.some((r) => r.startsWith("Cash") && r.endsWith("Rp40,000"))).toBe(true);
    expect(rows.some((r) => r.trim() === "Thank you")).toBe(true);
    expect(rows.every((r) => r.length <= 48)).toBe(true);
  });
  it("adds SALINAN right after the header", () => {
    const rows = formatReceipt(order, ctx({ copy: true, store: { ...store, receiptHeader: "Wifi: x" } }));
    const i = rows.findIndex((r) => r.includes("Wifi: x"));
    expect(rows[i + 1]?.trim()).toBe("SALINAN");
  });
  it("marks void and refund, uses custom footer and labels", () => {
    const labels = { id: { ...DEFAULT_RECEIPT_LABELS.id, total: "JUMLAH" }, en: DEFAULT_RECEIPT_LABELS.en };
    const rows = formatReceipt({ ...order, status: "voided" },
      ctx({ labels, store: { ...store, receiptFooter: "Sampai jumpa" } }));
    expect(rows.some((r) => r.trim() === "*** VOID ***")).toBe(true);
    expect(rows.some((r) => r.startsWith("JUMLAH"))).toBe(true);
    expect(rows.some((r) => r.trim() === "Sampai jumpa")).toBe(true);
    const refunded = formatReceipt({ ...order, status: "refunded" }, ctx());
    expect(refunded.some((r) => r.trim() === "*** REFUND ***")).toBe(true);
  });
  it("includes contributor lines and unknown payment codes", () => {
    const rows = formatReceipt({ ...order, payments: [{ method: "voucher", amountRp: 1 }] },
      ctx({ contributors: [() => ["Antrean: A-12\u001b"]] }));
    expect(rows).toContain("Antrean: A-12");
    expect(rows.some((r) => r.startsWith("voucher"))).toBe(true);
  });
  it("omits empty optional parts", () => {
    const bare = { ...order, discountRp: 0, serviceChargeRp: 0, taxRp: 0, roundingRp: 0,
      notes: null, orderType: "", cashierName: "" };
    const rows = formatReceipt(bare, ctx({ store: { ...store, npwp: "" } }));
    expect(rows.some((r) => /Diskon|Pajak|Layanan|Pembulatan|NPWP|Ket:|Kasir|Tipe/.test(r))).toBe(false);
  });
});

describe("formatKitchenTicket", () => {
  it("lists items, modifiers and notes", () => {
    const rows = formatKitchenTicket(order, [
      { name: "Kopi", qty: 2, modifiers: ["Extra shot"], note: "cepat" },
      { name: "Teh", qty: 1, modifiers: [] },
    ], ctx({ copy: true }));
    expect(rows).toMatchSnapshot();
  });
});
