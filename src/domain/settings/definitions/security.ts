import { defineSetting } from "../registry";

const base = { auditable: true, requiresRestart: false } as const;

export const SECURITY_SETTINGS = [
  defineSetting({ ...base, key: "nama_pengguna_maks_karakter", label: { id: "Panjang maksimal nama pengguna", en: "Maximum username length" }, type: "int", default: 40, min: 10, max: 60 }),
  defineSetting({ ...base, key: "pin_panjang_min", label: { id: "Panjang PIN minimum", en: "Minimum PIN length" }, type: "int", default: 4, min: 4, max: 6 }),
  defineSetting({ ...base, key: "pin_panjang_maks", label: { id: "Panjang PIN maksimum", en: "Maximum PIN length" }, type: "int", default: 6, min: 4, max: 8 }),
  defineSetting({ ...base, key: "maks_percobaan_pin", label: { id: "Percobaan PIN sebelum terkunci", en: "PIN attempts before lockout" }, type: "int", default: 5, min: 3, max: 10 }),
  defineSetting({ ...base, key: "durasi_kunci_menit", label: { id: "Durasi kunci (menit)", en: "Lockout duration (minutes)" }, type: "int", default: 5, min: 1, max: 60 }),
  defineSetting({ ...base, key: "idle_kunci_menit", label: { id: "Kunci otomatis saat diam (menit)", en: "Auto-lock when idle (minutes)" }, type: "int", default: 10, min: 1, max: 60 }),
] as const;
