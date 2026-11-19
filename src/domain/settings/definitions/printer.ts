import { defineSetting } from "../registry";

const base = { auditable: false, requiresRestart: false } as const;

export const PRINTER_SETTINGS = [
  defineSetting({ ...base, key: "lebar_kertas", label: { id: "Lebar kertas printer", en: "Printer paper width" }, type: "enum", default: "58mm", options: ["58mm", "80mm"] }),
  defineSetting({ ...base, key: "timeout_cetak_detik", label: { id: "Batas waktu cetak (detik)", en: "Print timeout (seconds)" }, type: "int", default: 10, min: 5, max: 60 }),
] as const;
