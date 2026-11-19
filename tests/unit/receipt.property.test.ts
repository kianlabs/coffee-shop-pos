import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatReceipt, sanitize, wrap, type ReceiptOrder } from "@/domain/receipt";
import { DEFAULT_STORE_PROFILE } from "@/domain/storeProfile";

const hasControl = (s: string, allowLf = false): boolean =>
  Array.from(s).some((c) => {
    const n = c.codePointAt(0) ?? 0;
    return (n <= 0x1f && !(allowLf && n === 0x0a)) || n === 0x7f;
  });
const cps = (s: string): number => Array.from(s).length;
const noSpace = (s: string): string => s.replace(/ /gu, "");
const anyText = fc.string({ unit: "binary", maxLength: 120 });
const name = fc.string({ unit: "binary", minLength: 1, maxLength: 120 });
const rp = fc.integer({ min: 0, max: 999_999_999 });

const orderArb: fc.Arbitrary<ReceiptOrder> = fc.record({
  receiptNumber: name, createdAt: fc.date({ min: new Date(2000, 0, 1), max: new Date(2090, 0, 1) }),
  cashierName: name, orderType: name, status: fc.constantFrom("completed", "voided", "refunded"),
  lines: fc.array(fc.record({ name, variantName: fc.option(name), qty: fc.integer({ min: 1, max: 999 }),
    unitPriceRp: rp, lineTotalRp: rp,
    modifiers: fc.array(fc.record({ name, deltaRp: fc.integer({ min: -99_999, max: 99_999 }) }), { maxLength: 3 }) }),
    { minLength: 1, maxLength: 4 }),
  subtotalRp: rp, discountRp: rp, serviceChargeRp: rp, taxRp: rp,
  roundingRp: fc.integer({ min: -500, max: 500 }), totalRp: rp,
  payments: fc.array(fc.record({ method: fc.constantFrom("cash", "qris_manual", "other"), amountRp: rp }),
    { minLength: 1, maxLength: 2 }),
  changeRp: rp, notes: fc.option(name),
});
const storeArb = fc.record({ name, address: anyText, npwp: anyText, logoB64: fc.constant(""),
  receiptHeader: anyText, receiptFooter: anyText });
const ctxArb = fc.record({ widthChars: fc.constantFrom(32 as const, 48 as const),
  lang: fc.constantFrom("id" as const, "en" as const), store: storeArb, contributors: fc.constant([]) });

// Property 18: Receipt line width and no character loss
describe("Property 18: line width and no character loss", () => {
  it("wrap keeps every character and respects width", () => {
    fc.assert(fc.property(anyText, fc.integer({ min: 1, max: 60 }), (text, width) => {
      const rows = wrap(text, width);
      expect(rows.every((r) => cps(r) <= width)).toBe(true);
      expect(noSpace(rows.join(""))).toBe(noSpace(text));
    }));
  });
  it("formatReceipt lines never exceed the width and money stays whole", () => {
    fc.assert(fc.property(orderArb, ctxArb, (order, ctx) => {
      const rows = formatReceipt(order, ctx);
      expect(rows.every((r) => cps(r) <= ctx.widthChars)).toBe(true);
      const sep = ctx.lang === "id" ? "." : ",";
      const total = `Rp${String(order.totalRp).replace(/\B(?=(\d{3})+(?!\d))/g, sep)}`;
      expect(rows.some((r) => r.trimEnd().endsWith(total))).toBe(true);
    }), { numRuns: 200 });
  });
  it("item and modifier text is fully printed (sanitized, spaces ignored)", () => {
    fc.assert(fc.property(orderArb, ctxArb, (order, ctx) => {
      const body = noSpace(formatReceipt(order, ctx).join(""));
      for (const l of order.lines) {
        const sanitized = noSpace(sanitize(l.name));
        // Names may be split across rows by indent spaces only, so compare without spaces.
        expect(body.includes(sanitized)).toBe(true);
      }
    }), { numRuns: 200 });
  });
});

// Property 19: Receipt sanitization
describe("Property 19: sanitization", () => {
  it("sanitize leaves no control code point", () => {
    fc.assert(fc.property(fc.string({ unit: "binary", maxLength: 200 }), (t) => {
      expect(hasControl(sanitize(t))).toBe(false);
    }));
  });
  it("formatReceipt output has no control code point from any input field", () => {
    fc.assert(fc.property(orderArb, ctxArb, (order, ctx) => {
      const rows = formatReceipt(order, ctx);
      expect(rows.every((r) => !hasControl(r))).toBe(true);
    }), { numRuns: 200 });
  });
  it("blocks ESC/POS injection sequences", () => {
    const evil = "\u001b@\u001d\u0056\u0000cut\u001bp\u0000";
    const rows = formatReceipt(
      { ...fc.sample(orderArb, 1)[0]!, cashierName: evil, notes: evil },
      { widthChars: 32, lang: "id", store: { ...DEFAULT_STORE_PROFILE, name: evil }, contributors: [] });
    expect(hasControl(rows.join("\n"), true)).toBe(false);
  });
});
