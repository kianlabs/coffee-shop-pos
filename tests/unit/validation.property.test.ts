// Property 23: Input validators accept exactly the configured range
// (Req 1.1, 1.11, 3.1, 3.2, 3.9, 9.1, 9.5)
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  charLength,
  nameKey,
  validateDisplayName,
  validateModifier,
  validateModifierGroup,
  validatePhone,
  validatePin,
  validateText,
} from "@/domain/validation";

const anyText = fc.string({ unit: "grapheme", maxLength: 80 });
const digits = (min: number, max: number) => fc.string({ unit: fc.constantFrom(..."0123456789"), minLength: min, maxLength: max });

describe("Property 23: input validators accept exactly the configured range", () => {
  it("display name: accepted iff 1..max chars after trim and unique ignoring case", () => {
    fc.assert(
      fc.property(anyText, fc.integer({ min: 10, max: 60 }), fc.array(anyText, { maxLength: 5 }), (name, max, others) => {
        const trimmed = name.trim();
        const len = charLength(trimmed);
        const taken = others.some((o) => nameKey(o) === nameKey(trimmed));
        const result = validateDisplayName(name, { maxLength: max }, others);
        expect(result.ok).toBe(len >= 1 && len <= max && !taken);
        if (result.ok) return;
        const expected = len === 0 ? "display_name_empty" : len > max ? "display_name_too_long" : "display_name_taken";
        expect(result.rule).toBe(expected);
      }),
    );
  });

  it("PIN: accepted iff only 0-9 and min..max digits", () => {
    const bounds = fc.tuple(fc.integer({ min: 4, max: 6 }), fc.integer({ min: 4, max: 8 })).filter(([a, b]) => a <= b);
    const pin = fc.oneof(digits(0, 10), fc.string({ maxLength: 10 }));
    fc.assert(
      fc.property(pin, bounds, (value, [min, max]) => {
        const allDigits = /^[0-9]*$/.test(value);
        const result = validatePin(value, { minLength: min, maxLength: max });
        expect(result.ok).toBe(allDigits && value.length >= min && value.length <= max);
        if (result.ok) return;
        const expected = !allDigits ? "pin_not_digits" : value.length < min ? "pin_too_short" : "pin_too_long";
        expect(result.rule).toBe(expected);
      }),
    );
  });

  it("phone: accepted iff empty or optional '+' then min..max digits", () => {
    const bounds = fc.tuple(fc.integer({ min: 6, max: 10 }), fc.integer({ min: 10, max: 20 }));
    const phone = fc.oneof(
      fc.tuple(fc.boolean(), digits(0, 24)).map(([plus, d]) => (plus ? "+" : "") + d),
      fc.string({ maxLength: 24 }),
    );
    fc.assert(
      fc.property(phone, bounds, (value, [min, max]) => {
        const trimmed = value.trim();
        const match = /^\+?([0-9]+)$/.exec(trimmed);
        const count = match ? match[1].length : -1;
        const result = validatePhone(value, { minDigits: min, maxDigits: max });
        expect(result.ok).toBe(trimmed === "" || (count >= min && count <= max));
        if (result.ok) return;
        const expected = !match ? "phone_format" : count < min ? "phone_too_short" : "phone_too_long";
        expect(result.rule).toBe(expected);
      }),
    );
  });

  it("free text: accepted iff trimmed length ≤ max and non-empty when required", () => {
    fc.assert(
      fc.property(anyText, fc.integer({ min: 0, max: 60 }), fc.boolean(), (text, max, required) => {
        const len = charLength(text.trim());
        const result = validateText(text, { maxLength: max, required, label: "Catatan" });
        expect(result.ok).toBe(len <= max && (!required || len > 0));
        if (result.ok) return;
        expect(result.rule).toBe(required && len === 0 ? "text_required" : "text_too_long");
      }),
    );
  });

  it("modifier group: accepted iff every range rule holds", () => {
    const limits = fc.record({
      nameMaxLength: fc.integer({ min: 10, max: 100 }),
      choicesMax: fc.integer({ min: 1, max: 50 }),
      modifiersPerGroupMax: fc.integer({ min: 1, max: 50 }),
    });
    const group = fc.record({
      name: anyText,
      minChoices: fc.integer({ min: -2, max: 55 }),
      maxChoices: fc.integer({ min: -2, max: 55 }),
      modifierCount: fc.integer({ min: -1, max: 55 }),
      activeModifierCount: fc.integer({ min: 0, max: 55 }),
    });
    fc.assert(
      fc.property(group, limits, (g, l) => {
        const len = charLength(g.name.trim());
        const valid =
          len >= 1 &&
          len <= l.nameMaxLength &&
          g.minChoices >= 0 &&
          g.minChoices <= l.choicesMax &&
          g.maxChoices >= 1 &&
          g.maxChoices <= l.choicesMax &&
          g.minChoices <= g.maxChoices &&
          g.modifierCount >= 1 &&
          g.modifierCount <= l.modifiersPerGroupMax &&
          g.maxChoices <= g.activeModifierCount;
        const result = validateModifierGroup(g, l);
        expect(result.ok).toBe(valid);
        if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
      }),
    );
  });

  it("modifier: accepted iff name 1..max unique, delta 0..max, HPP null or ≥ 0", () => {
    const input = fc.record({
      name: anyText,
      priceDeltaRp: fc.integer({ min: -10, max: 10_000_010 }),
      hppRp: fc.option(fc.integer({ min: -10, max: 1_000_000 }), { nil: null }),
    });
    const limits = fc.record({ nameMaxLength: fc.integer({ min: 10, max: 100 }), priceDeltaMax: fc.integer({ min: 0, max: 10_000_000 }) });
    fc.assert(
      fc.property(input, limits, fc.array(anyText, { maxLength: 4 }), (m, l, others) => {
        const len = charLength(m.name.trim());
        const taken = others.some((o) => nameKey(o) === nameKey(m.name));
        const valid =
          len >= 1 &&
          len <= l.nameMaxLength &&
          !taken &&
          m.priceDeltaRp >= 0 &&
          m.priceDeltaRp <= l.priceDeltaMax &&
          (m.hppRp === null || m.hppRp >= 0);
        expect(validateModifier(m, l, others).ok).toBe(valid);
      }),
    );
  });
});
