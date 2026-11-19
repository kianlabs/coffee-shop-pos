import type { IntDef, MultiDef, SettingDef, TextDef } from "./registry";

const TIME_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateInt(def: IntDef, value: unknown): string | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return `${def.key} harus bilangan bulat.`;
  if (value < def.min || value > def.max) return `${def.key} harus antara ${def.min} dan ${def.max}.`;
  if (def.allowed && !def.allowed.includes(value)) return `${def.key} harus salah satu dari: ${def.allowed.join(", ")}.`;
  return null;
}

function validateText(def: TextDef, value: unknown): string | null {
  if (typeof value !== "string") return `${def.key} harus berupa teks.`;
  if (value.length > def.maxLength) return `${def.key} maksimal ${def.maxLength} karakter.`;
  if (def.format === "time" && !TIME_HH_MM.test(value)) return `${def.key} harus berformat JJ:mm (00:00 sampai 23:59).`;
  return null;
}

function validateMulti(def: MultiDef, value: unknown): string | null {
  const list: unknown[] | null = Array.isArray(value) ? value : null;
  if (!list || !list.every((v) => typeof v === "string" && def.options.includes(v))) {
    return `${def.key} harus berupa daftar dari: ${def.options.join(", ")}.`;
  }
  if (new Set(list).size !== list.length) return `${def.key} tidak boleh berisi pilihan ganda.`;
  if (list.length < def.minSelected) return `${def.key} minimal ${def.minSelected} pilihan aktif.`;
  return null;
}

/** Returns an Indonesian error message for an invalid value, or null when valid. */
export function validateValue(def: SettingDef, value: unknown): string | null {
  switch (def.type) {
    case "int":
      return validateInt(def, value);
    case "bool":
      return typeof value === "boolean" ? null : `${def.key} harus true atau false.`;
    case "text":
      return validateText(def, value);
    case "enum":
      if (typeof value !== "string" || !def.options.includes(value)) {
        return `${def.key} harus salah satu dari: ${def.options.join(", ")}.`;
      }
      return null;
    case "multi":
      return validateMulti(def, value);
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
