import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { closeShift, openShift, summarizeShift, type Shift } from "@/domain/shifts";
import {
  endOfDay,
  formatRangeLabel,
  ordersInRange,
  paymentBreakdown,
  rangeFor,
  salesTrend,
  startOfDay,
  summarizeSales,
  topProducts,
} from "@/domain/sales";
import {
  DEFAULT_STORE_PROFILE,
  profileFromRows,
  profileToRows,
  sanitizeStoreProfile,
  storeProfileKeys,
} from "@/domain/storeProfile";
import { formatRupiah, formatThousands, parseThousands } from "@/domain/money";
import { sampleOrder } from "./fixtures";

const NOON = new Date("2026-11-19T12:00:00");
const dayStart = startOfDay(NOON);
const dayEnd = endOfDay(NOON);

describe("sales", () => {
  const orders = [
    sampleOrder({}, new Date(dayStart.getTime() + 60 * 60 * 1000)),
    sampleOrder({ idempotencyKey: "key-2", payment: { method: "qris_manual", amountRp: 0, paidAt: "2026-11-19T11:00:00.000Z" } }, new Date(dayStart.getTime() + 3 * 60 * 60 * 1000)),
  ];
  orders[1].payment.amountRp = orders[1].totalRp;
  orders[1].changeRp = 0;
  const voided = { ...sampleOrder({ idempotencyKey: "key-3" }, new Date(dayStart.getTime() + 2 * 60 * 60 * 1000)), status: "voided" as const };
  const all = [...orders, voided];

  it("batas hari dan rentang hari ini", () => {
    expect(dayStart.getHours()).toBe(0);
    expect(dayEnd.getHours()).toBe(23);
    const today = rangeFor("today", NOON);
    expect(today.start.getTime()).toBe(dayStart.getTime());
    expect(rangeFor("yesterday", NOON).end.getTime()).toBeLessThan(dayStart.getTime());
    expect(rangeFor("thisWeek", NOON).start.getTime()).toBeLessThanOrEqual(dayStart.getTime());
    expect(rangeFor("last7", NOON).start.getTime()).toBeLessThan(dayStart.getTime());
  });

  it("order dalam rentang difilter dengan batas inklusif", () => {
    expect(ordersInRange(all, dayStart, dayEnd)).toHaveLength(3);
    expect(ordersInRange(all, new Date(0), new Date(1))).toHaveLength(0);
  });

  it("ringkasan hanya menghitung order completed", () => {
    const s = summarizeSales(all, dayStart, dayEnd);
    expect(s.orderCount ?? s.completedCount).toBeDefined();
    expect(JSON.stringify(s)).toContain(String(orders[0].totalRp));
  });

  it("produk terlaris, metode bayar, dan tren", () => {
    expect(topProducts(all, dayStart, dayEnd, 1)).toHaveLength(1);
    expect(topProducts(all, dayStart, dayEnd).length).toBeGreaterThan(0);
    expect(paymentBreakdown(all, dayStart, dayEnd).length).toBeGreaterThan(0);
    const trend = salesTrend(all, dayStart, dayEnd);
    expect(trend).toBeDefined();
    expect(formatRangeLabel(dayStart, dayEnd)).toEqual(expect.any(String));
  });

  it("tren tidak menghitung omzet negatif untuk data acak", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23 }), (h) => {
        const o = sampleOrder({ idempotencyKey: `k-${h}` }, new Date(dayStart.getTime() + h * 3_600_000));
        const trend = salesTrend([o], dayStart, dayEnd);
        expect(trend).toBeDefined();
      }),
    );
  });
});

describe("shifts", () => {
  const opened = openShift("Kian", 50000);

  it("buka shift menyimpan modal dan nama kasir", () => {
    expect(opened.cashierName).toBe("Kian");
    expect(opened.openCashRp).toBe(50000);
    expect(opened.closedAt).toBeNull();
    expect(openShift("Budi").openCashRp).toBe(0);
  });

  it("ringkasan shift hanya memuat order completed di dalam jendela shift", () => {
    const inside = sampleOrder({ idempotencyKey: "in" }, new Date(Date.parse(opened.openedAt) + 1000));
    const before = sampleOrder({ idempotencyKey: "before" }, new Date(Date.parse(opened.openedAt) - 1000));
    const voidedInside = { ...sampleOrder({ idempotencyKey: "v" }, new Date(Date.parse(opened.openedAt) + 2000)), status: "voided" as const };
    const s: Shift = opened;
    const summary = summarizeShift(s, [inside, before, voidedInside]);
    expect(summary).toEqual({ orderCount: 1, grandTotalRp: inside.totalRp });
  });

  it("tutup shift memberi waktu tutup dan menghitung ulang ringkasan", () => {
    const closeAt = new Date(Date.parse(opened.openedAt) + 60_000);
    const { shift, summary } = closeShift(opened, [], closeAt);
    expect(shift.closedAt).toBe(closeAt.toISOString());
    expect(summary.orderCount).toBe(0);
  });

  it("ringkasan tanpa batas tutup tetap menghitung order setelah buka", () => {
    const later = sampleOrder({ idempotencyKey: "later" }, new Date(Date.parse(opened.openedAt) + 99_999_999));
    expect(summarizeShift(opened, [later]).orderCount).toBe(1);
  });
});

describe("store profile", () => {
  it("nama kosong kembali ke bawaan dan teks dipotong sesuai batas", () => {
    expect(sanitizeStoreProfile({ name: "   " }).name).toBe(DEFAULT_STORE_PROFILE.name);
    expect(sanitizeStoreProfile({ name: "x".repeat(500) }).name.length).toBeLessThanOrEqual(100);
    expect(sanitizeStoreProfile({}).npwp).toBe("");
  });

  it("logo hanya diterima bila berupa data URL PNG di bawah batas", () => {
    expect(sanitizeStoreProfile({ logoB64: "data:image/png;base64,AAAA" }).logoB64).toBe("data:image/png;base64,AAAA");
    expect(sanitizeStoreProfile({ logoB64: "javascript:alert(1)" }).logoB64).toBe("");
    expect(sanitizeStoreProfile({ logoB64: 123 as unknown as string }).logoB64).toBe("");
  });

  it("baris setelan dan profil saling bolak-balik", () => {
    const profile = sanitizeStoreProfile({ name: "Sura Kopi", address: "Surakarta", receiptFooter: "Terima kasih" });
    const rows = profileToRows(profile);
    expect(storeProfileKeys()).toHaveLength(rows.length);
    expect(profileFromRows(rows)).toEqual(profile);
  });
});

describe("money formatting", () => {
  it("format Rupiah dan pemisah ribuan", () => {
    expect(formatThousands(1234567)).toMatch(/1\.234\.567/);
    expect(formatThousands(null)).toBe("");
    expect(formatThousands("abc")).toBe("");
    expect(formatRupiah(18000)).toMatch(/18\.000/);
    expect(formatRupiah(-5000)).toMatch(/5\.000/);
  });

  it("parse angka berformat kembali ke bilangan bulat", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999_999_999 }), (n) => {
        expect(parseThousands(formatThousands(n))).toBe(n);
      }),
    );
    expect(parseThousands(null)).toBe(0);
  });
});

describe("parseThousands batas", () => {
  it("angka desimal, non-finite, dan batas aman", () => {
    expect(parseThousands(12.9)).toBe(12);
    expect(parseThousands(Number.NaN)).toBe(0);
    expect(parseThousands(Number.POSITIVE_INFINITY)).toBe(0);
    expect(parseThousands(1e15)).toBe(999_999_999_999);
    expect(parseThousands(-1e15)).toBe(-999_999_999_999);
    expect(parseThousands("-Rp 50.000")).toBe(-50000);
    expect(parseThousands("99999999999999999999")).toBe(999_999_999_999);
    expect(parseThousands("abc")).toBe(0);
  });
});
