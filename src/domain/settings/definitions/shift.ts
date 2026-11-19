import { defineSetting } from "../registry";

const base = { group: "shift", auditable: true, requiresRestart: false } as const;

export const SHIFT_SETTINGS = [
  defineSetting({ ...base, key: "shift.kas_masuk_keluar_maks", type: "int", default: 100_000_000, min: 1_000_000, max: 1_000_000_000,
    label: { id: "Batas kas masuk/keluar", en: "Cash in/out limit" },
    help: { id: "Nominal terbesar (Rupiah) untuk satu catatan kas masuk atau kas keluar.", en: "Largest amount (Rupiah) for a single cash-in or cash-out entry." } }),
  defineSetting({ ...base, key: "shift.modal_awal_maks", type: "int", default: 100_000_000, min: 1_000_000, max: 1_000_000_000,
    label: { id: "Batas modal awal shift", en: "Opening float limit" },
    help: { id: "Nominal terbesar (Rupiah) yang boleh diisi sebagai modal awal saat membuka shift.", en: "Largest opening float (Rupiah) allowed when opening a shift." } }),
] as const;
