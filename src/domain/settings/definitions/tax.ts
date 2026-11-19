import { defineSetting } from "../registry";

const base = { auditable: true, requiresRestart: false } as const;

/** Rates are in basis points: 1100 = 11.00 %. */
export const TAX_SETTINGS = [
  defineSetting({ ...base, key: "tarif_bp", label: { id: "Tarif pajak (basis poin)", en: "Tax rate (basis points)" }, type: "int", default: 0, min: 0, max: 10_000 }),
  defineSetting({ ...base, key: "biaya_layanan_bp", label: { id: "Biaya layanan (basis poin)", en: "Service charge (basis points)" }, type: "int", default: 0, min: 0, max: 10_000 }),
  defineSetting({ ...base, key: "biaya_layanan_aktif", label: { id: "Aktifkan biaya layanan", en: "Enable service charge" }, type: "bool", default: false }),
  defineSetting({ ...base, key: "pembulatan_aktif", label: { id: "Aktifkan pembulatan", en: "Enable rounding" }, type: "bool", default: false }),
  defineSetting({ ...base, key: "pembulatan_kelipatan", label: { id: "Kelipatan pembulatan", en: "Rounding step" }, type: "int", default: 100, min: 100, max: 1000 }),
  defineSetting({ ...base, key: "pajak_mode", label: { id: "Mode pajak", en: "Tax mode" }, type: "enum", default: "off", options: ["off", "exclusive", "inclusive"] }),
] as const;

export const DISCOUNT_SETTINGS = [
  defineSetting({ ...base, key: "batas_tanpa_otorisasi_persen", label: { id: "Diskon maksimal tanpa otorisasi (%)", en: "Maximum discount without approval (%)" }, type: "int", default: 10, min: 0, max: 100 }),
] as const;
