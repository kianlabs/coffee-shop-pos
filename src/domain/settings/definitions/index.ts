import { minNotAboveMax, type CrossRule } from "../validate";
import { DISCOUNT_SETTINGS, TAX_SETTINGS } from "./tax";
import { PRINTER_SETTINGS } from "./printer";
import { RECEIPT_SETTINGS } from "./receipt";
import { SECURITY_SETTINGS } from "./security";
import { SHIFT_SETTINGS } from "./shift";

/** Every registered setting. Keys not listed here are rejected by the type system and by SettingsService. */
export const SETTINGS = [
  ...SECURITY_SETTINGS,
  ...SHIFT_SETTINGS,
  ...TAX_SETTINGS,
  ...DISCOUNT_SETTINGS,
  ...PRINTER_SETTINGS,
  ...RECEIPT_SETTINGS,
] as const;

export type SettingDefinition = (typeof SETTINGS)[number];
export type SettingKey = SettingDefinition["key"];

export function settingByKey(key: string): SettingDefinition | undefined {
  return SETTINGS.find((s) => s.key === key);
}

export function defaultSettings(): Record<SettingKey, unknown> {
  return Object.fromEntries(SETTINGS.map((s) => [s.key, s.default])) as Record<SettingKey, unknown>;
}

/** Cross-key rules checked whenever any of their keys change. */
export const CROSS_RULES: readonly CrossRule[] = [minNotAboveMax("pin_panjang_min", "pin_panjang_maks")];
