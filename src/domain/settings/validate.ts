import type { SettingDef } from "./registry";

/** Returns an Indonesian error message for an invalid value, or null when valid. */
export function validateValue(def: SettingDef, value: unknown): string | null {
  switch (def.type) {
    case "int":
      if (typeof value !== "number" || !Number.isInteger(value)) return `${def.key} harus bilangan bulat.`;
      if (value < def.min || value > def.max) return `${def.key} harus antara ${def.min} dan ${def.max}.`;
      return null;
    case "bool":
      return typeof value === "boolean" ? null : `${def.key} harus true atau false.`;
    case "text":
      if (typeof value !== "string") return `${def.key} harus berupa teks.`;
      if (value.length > def.maxLength) return `${def.key} maksimal ${def.maxLength} karakter.`;
      return null;
    case "enum":
      if (typeof value !== "string" || !def.options.includes(value)) {
        return `${def.key} harus salah satu dari: ${def.options.join(", ")}.`;
      }
      return null;
  }
}

/** A cross-key rule: returns an error message or null. */
export type CrossRule = (values: Record<string, unknown>) => string | null;

export function minNotAboveMax(minKey: string, maxKey: string): CrossRule {
  return (values) => {
    const lo = values[minKey];
    const hi = values[maxKey];
    if (typeof lo !== "number" || typeof hi !== "number") return null;
    return lo <= hi ? null : `${minKey} tidak boleh lebih besar dari ${maxKey}.`;
  };
}

/** Runs every rule and returns the first error, or null. */
export function validateCross(rules: readonly CrossRule[], values: Record<string, unknown>): string | null {
  for (const rule of rules) {
    const error = rule(values);
    if (error) return error;
  }
  return null;
}
