import { describe, expect, it } from "vitest";
import {
  charLength,
  validateDisplayName,
  validateModifier,
  validateModifierGroup,
  validatePhone,
  validatePin,
  validateText,
  type ModifierGroupInput,
} from "@/domain/validation";

function ruleOf(result: { ok: true } | { ok: false; rule: string }): string | null {
  return result.ok ? null : result.rule;
}

describe("validateDisplayName", () => {
  const limits = { maxLength: 10 };
  it("accepts a trimmed name within the limit", () => {
    expect(validateDisplayName("  Budi  ", limits, [])).toEqual({ ok: true });
    expect(validateDisplayName("a".repeat(10), limits, [])).toEqual({ ok: true });
  });
  it("rejects empty, too long, and case-insensitive duplicates", () => {
    expect(ruleOf(validateDisplayName("   ", limits, []))).toBe("display_name_empty");
    expect(ruleOf(validateDisplayName("a".repeat(11), limits, []))).toBe("display_name_too_long");
    expect(ruleOf(validateDisplayName("budi", limits, ["Siti", " BUDI "]))).toBe("display_name_taken");
  });
  it("names the rule in an Indonesian message", () => {
    const result = validateDisplayName("Budi", limits, ["budi"]);
    expect(result.ok ? "" : result.message).toContain("sudah dipakai");
  });
  it("counts an emoji as one character", () => {
    expect(charLength("☕😀")).toBe(2);
    expect(validateDisplayName("😀".repeat(10), limits, [])).toEqual({ ok: true });
  });
});

describe("validatePin", () => {
  const limits = { minLength: 4, maxLength: 6 };
  it("accepts 4 to 6 digits", () => {
    expect(validatePin("0000", limits)).toEqual({ ok: true });
    expect(validatePin("123456", limits)).toEqual({ ok: true });
  });
  it("rejects non-digits, short and long PINs", () => {
    expect(ruleOf(validatePin("12a4", limits))).toBe("pin_not_digits");
    expect(ruleOf(validatePin(" 1234", limits))).toBe("pin_not_digits");
    expect(ruleOf(validatePin("١٢٣٤", limits))).toBe("pin_not_digits");
    expect(ruleOf(validatePin("", limits))).toBe("pin_too_short");
    expect(ruleOf(validatePin("123", limits))).toBe("pin_too_short");
    expect(ruleOf(validatePin("1234567", limits))).toBe("pin_too_long");
  });
});

describe("validatePhone", () => {
  const limits = { minDigits: 8, maxDigits: 15 };
  it("accepts empty, plain digits and a leading plus", () => {
    expect(validatePhone("", limits)).toEqual({ ok: true });
    expect(validatePhone("08123456789", limits)).toEqual({ ok: true });
    expect(validatePhone("+628123456789", limits)).toEqual({ ok: true });
  });
  it("rejects bad characters and digit counts outside the range", () => {
    expect(ruleOf(validatePhone("0812-3456", limits))).toBe("phone_format");
    expect(ruleOf(validatePhone("+", limits))).toBe("phone_format");
    expect(ruleOf(validatePhone("++62812345678", limits))).toBe("phone_format");
    expect(ruleOf(validatePhone("1234567", limits))).toBe("phone_too_short");
    expect(ruleOf(validatePhone("1".repeat(16), limits))).toBe("phone_too_long");
  });
});

describe("validateText", () => {
  it("requires text when configured and limits its length", () => {
    const name = { maxLength: 5, required: true, label: "Nama pelanggan" };
    expect(ruleOf(validateText("  ", name))).toBe("text_required");
    expect(ruleOf(validateText("abcdef", name))).toBe("text_too_long");
    expect(validateText(" abcde ", name)).toEqual({ ok: true });
    const result = validateText("", name);
    expect(result.ok ? "" : result.message).toBe("Nama pelanggan wajib diisi.");
  });
  it("accepts empty optional text, including a zero limit", () => {
    expect(validateText("", { maxLength: 0, required: false, label: "Catatan" })).toEqual({ ok: true });
    expect(ruleOf(validateText("x", { maxLength: 0, required: false, label: "Catatan" }))).toBe("text_too_long");
  });
});

describe("validateModifierGroup", () => {
  const limits = { nameMaxLength: 10, choicesMax: 5, modifiersPerGroupMax: 4 };
  const base: ModifierGroupInput = { name: "Susu", minChoices: 1, maxChoices: 2, modifierCount: 3, activeModifierCount: 2 };
  const cases: Array<[Partial<ModifierGroupInput>, string]> = [
    [{ name: " " }, "group_name_empty"],
    [{ name: "x".repeat(11) }, "group_name_too_long"],
    [{ minChoices: -1 }, "min_choices_range"],
    [{ minChoices: 1.5 }, "min_choices_range"],
    [{ minChoices: 6, maxChoices: 5 }, "min_choices_range"],
    [{ maxChoices: 0, minChoices: 0 }, "max_choices_range"],
    [{ maxChoices: 6 }, "max_choices_range"],
    [{ minChoices: 2, maxChoices: 1 }, "min_above_max"],
    [{ modifierCount: 0, activeModifierCount: 0 }, "modifier_count_range"],
    [{ modifierCount: 5 }, "modifier_count_range"],
    [{ maxChoices: 3 }, "max_above_active_modifiers"],
  ];
  it.each(cases)("rejects %o with %s", (patch, rule) => {
    expect(ruleOf(validateModifierGroup({ ...base, ...patch }, limits))).toBe(rule);
  });
  it("accepts a valid group, including optional groups (min 0)", () => {
    expect(validateModifierGroup(base, limits)).toEqual({ ok: true });
    expect(validateModifierGroup({ ...base, minChoices: 0, maxChoices: 1 }, limits)).toEqual({ ok: true });
  });
});

describe("validateModifier", () => {
  const limits = { nameMaxLength: 10, priceDeltaMax: 1_000_000 };
  const base = { name: "Oat", priceDeltaRp: 5000, hppRp: null };
  it("accepts a valid modifier with or without manual HPP", () => {
    expect(validateModifier(base, limits, ["Full cream"])).toEqual({ ok: true });
    expect(validateModifier({ ...base, hppRp: 0, priceDeltaRp: 0 }, limits, [])).toEqual({ ok: true });
  });
  it("rejects each rule", () => {
    expect(ruleOf(validateModifier({ ...base, name: "" }, limits, []))).toBe("modifier_name_empty");
    expect(ruleOf(validateModifier({ ...base, name: "x".repeat(11) }, limits, []))).toBe("modifier_name_too_long");
    expect(ruleOf(validateModifier(base, limits, ["OAT"]))).toBe("modifier_name_taken");
    expect(ruleOf(validateModifier({ ...base, priceDeltaRp: -1 }, limits, []))).toBe("price_delta_range");
    expect(ruleOf(validateModifier({ ...base, priceDeltaRp: 1_000_001 }, limits, []))).toBe("price_delta_range");
    expect(ruleOf(validateModifier({ ...base, priceDeltaRp: 10.5 }, limits, []))).toBe("price_delta_range");
    expect(ruleOf(validateModifier({ ...base, hppRp: -1 }, limits, []))).toBe("hpp_invalid");
  });
  it("shows the price range in Rupiah", () => {
    const result = validateModifier({ ...base, priceDeltaRp: -1 }, limits, []);
    expect(result.ok ? "" : result.message).toContain("Rp1.000.000");
  });
});
