import type { SettingGroup } from "../registry";
import { minNotAboveMax, type CrossRule } from "../validate";
import { BACKUP_SETTINGS } from "./backup";
import { CASHIER_SETTINGS } from "./cashier";
import { CATALOG_SETTINGS } from "./catalog";
import { CUSTOMER_SETTINGS } from "./customer";
import { DISPLAY_SETTINGS, LANGUAGE_SETTINGS } from "./display";
import { FNB_SETTINGS } from "./fnb";
import { PAYMENT_SETTINGS } from "./payment";
import { PRINTER_SETTINGS } from "./printer";
import { RECEIPT_SETTINGS } from "./receipt";
import { SECURITY_SETTINGS } from "./security";
import { SHIFT_SETTINGS } from "./shift";
import { STOCK_SETTINGS } from "./stock";
import { SYNC_SETTINGS } from "./sync";
import { DISCOUNT_SETTINGS, TAX_SETTINGS } from "./tax";

/** Every registered setting. Keys not listed here are rejected by the type system and by SettingsService. */
export const SETTINGS = [
  ...SECURITY_SETTINGS,
  ...SHIFT_SETTINGS,
  ...CASHIER_SETTINGS,
  ...CATALOG_SETTINGS,
  ...FNB_SETTINGS,
  ...CUSTOMER_SETTINGS,
  ...TAX_SETTINGS,
  ...DISCOUNT_SETTINGS,
  ...PAYMENT_SETTINGS,
  ...STOCK_SETTINGS,
  ...PRINTER_SETTINGS,
  ...RECEIPT_SETTINGS,
  ...BACKUP_SETTINGS,
  ...SYNC_SETTINGS,
  ...LANGUAGE_SETTINGS,
  ...DISPLAY_SETTINGS,
] as const;

export type SettingDefinition = (typeof SETTINGS)[number];
export type SettingKey = SettingDefinition["key"];

type ValueOf<D> = D extends { type: "int" }
  ? number
  : D extends { type: "bool" }
    ? boolean
    : D extends { type: "enum"; options: readonly (infer O)[] }
      ? O
      : D extends { type: "multi"; options: readonly (infer O)[] }
        ? readonly O[]
        : string;

/** The value type of one key, widened from its literal default (an int key gives `number`). */
export type SettingValue<K extends SettingKey> = ValueOf<Extract<SettingDefinition, { key: K }>>;
export type SettingValues = { [K in SettingKey]: SettingValue<K> };

export function settingByKey(key: string): SettingDefinition | undefined {
  return SETTINGS.find((s) => s.key === key);
}

export function isSettingKey(key: string): key is SettingKey {
  return settingByKey(key) !== undefined;
}

export function settingsInGroup(group: SettingGroup): readonly SettingDefinition[] {
  return SETTINGS.filter((s) => s.group === group);
}

export function defaultSettings(): SettingValues {
  const out: Partial<Record<SettingKey, unknown>> = {};
  for (const s of SETTINGS) out[s.key] = s.default;
  return out as SettingValues;
}

/** Cross-key rules checked whenever any of their keys change. */
export const CROSS_RULES: readonly CrossRule[] = [
  minNotAboveMax("keamanan.pin_panjang_min", "keamanan.pin_panjang_maks"),
  minNotAboveMax("sinkronisasi.jeda_dasar_detik", "sinkronisasi.jeda_maks_detik"),
  minNotAboveMax("pelanggan.telepon_digit_min", "pelanggan.telepon_digit_maks"),
];
