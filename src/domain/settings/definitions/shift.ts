import { defineSetting } from "../registry";

const base = { auditable: true, requiresRestart: false } as const;

export const SHIFT_SETTINGS = [
  defineSetting({ ...base, key: "kas_masuk_keluar_maks", label: { id: "Batas kas masuk/keluar", en: "Cash in/out limit" }, type: "int", default: 100_000_000, min: 1_000_000, max: 1_000_000_000 }),
  defineSetting({ ...base, key: "modal_awal_maks", label: { id: "Batas modal awal shift", en: "Opening float limit" }, type: "int", default: 100_000_000, min: 1_000_000, max: 1_000_000_000 }),
] as const;
