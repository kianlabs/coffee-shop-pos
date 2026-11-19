/**
 * Preset_Usaha (Req 29.1, 29.2). `applyPreset` is pure: it returns the planned
 * writes to `modules`, `app_settings`, and UI label overrides, nothing else.
 */
import { settingByKey, type SettingKey } from "./settings/definitions";

export type BusinessType = "fnb_kafe" | "fnb_resto" | "fnb_warung" | "lainnya";
type Bilingual = { id: string; en: string };

export interface BusinessTypeOption {
  id: BusinessType | "retail" | "jasa";
  label: Bilingual;
  /** False for types shown disabled with the "segera hadir" badge. */
  available: boolean;
  badge?: Bilingual;
}

export interface BusinessPreset {
  businessType: BusinessType;
  modules: readonly string[];
  settings: Partial<Record<SettingKey, unknown>>;
  /** i18n key → override text. */
  labels: Readonly<Record<string, Bilingual>>;
}

const COMING_SOON: Bilingual = { id: "Segera hadir", en: "Coming soon" };

/** Order is the order shown in the first onboarding step. */
export const BUSINESS_TYPE_OPTIONS: readonly BusinessTypeOption[] = [
  { id: "fnb_kafe", label: { id: "Kafe / kedai kopi", en: "Café / coffee shop" }, available: true },
  { id: "fnb_resto", label: { id: "Restoran", en: "Restaurant" }, available: true },
  { id: "fnb_warung", label: { id: "Warung makan", en: "Food stall" }, available: true },
  { id: "lainnya", label: { id: "Lainnya", en: "Other" }, available: true },
  { id: "retail", label: { id: "Retail / toko", en: "Retail" }, available: false, badge: COMING_SOON },
  { id: "jasa", label: { id: "Jasa", en: "Services" }, available: false, badge: COMING_SOON },
];

export const PRESETS: Readonly<Record<BusinessType, BusinessPreset>> = {
  fnb_kafe: { businessType: "fnb_kafe", modules: ["fnb"], settings: {}, labels: {} },
  fnb_resto: {
    businessType: "fnb_resto",
    modules: ["fnb"],
    settings: { pajak_mode: "exclusive", tarif_bp: 1000, biaya_layanan_aktif: true, biaya_layanan_bp: 500, lebar_kertas: "80mm" },
    labels: {},
  },
  fnb_warung: {
    businessType: "fnb_warung",
    modules: ["fnb"],
    settings: { pembulatan_aktif: true, pembulatan_kelipatan: 500 },
    labels: {},
  },
  lainnya: {
    businessType: "lainnya",
    modules: [],
    settings: {},
    labels: {
      "app.nav.menu": { id: "Produk", en: "Products" },
      "app.title.menu": { id: "Produk & Harga", en: "Products & Prices" },
    },
  },
};

export interface PresetPlan {
  businessType: BusinessType;
  /** Rows for the `modules` table. */
  modules: { id: string; enabled: boolean }[];
  /** Rows for `app_settings`. */
  settings: { key: SettingKey; value: unknown }[];
  /** Label overrides; `null` clears an override left by another preset. */
  labels: { key: string; value: Bilingual | null }[];
}

export type PresetResult = { ok: true; plan: PresetPlan } | { ok: false; error: string };

function isBusinessType(value: string): value is BusinessType {
  return Object.hasOwn(PRESETS, value);
}

function managedSettingKeys(): SettingKey[] {
  const keys = Object.values(PRESETS).flatMap((p) => Object.keys(p.settings));
  return [...new Set(keys)].filter((k): k is SettingKey => settingByKey(k) !== undefined);
}

function managedLabelKeys(): string[] {
  return [...new Set(Object.values(PRESETS).flatMap((p) => Object.keys(p.labels)))];
}

/**
 * Plans the writes for one preset. Every key any preset manages gets a value
 * (preset value or registry default) so switching presets is deterministic.
 * `knownModuleIds` are registered modules; those outside the preset are disabled.
 */
export function applyPreset(type: string, knownModuleIds: readonly string[]): PresetResult {
  const option = BUSINESS_TYPE_OPTIONS.find((o) => o.id === type);
  if (option && !option.available) return { ok: false, error: `Jenis usaha "${option.label.id}" segera hadir.` };
  if (!isBusinessType(type)) return { ok: false, error: `Jenis usaha "${type}" tidak dikenal.` };
  const preset = PRESETS[type];
  const enabled = new Set(preset.modules);
  const moduleIds = [...new Set([...knownModuleIds, ...preset.modules])];
  const settings = managedSettingKeys().map((key) => ({
    key,
    value: Object.hasOwn(preset.settings, key) ? preset.settings[key] : settingByKey(key)?.default,
  }));
  const labels = managedLabelKeys().map((key) => ({ key, value: preset.labels[key] ?? null }));
  return {
    ok: true,
    plan: { businessType: type, modules: moduleIds.map((id) => ({ id, enabled: enabled.has(id) })), settings, labels },
  };
}
