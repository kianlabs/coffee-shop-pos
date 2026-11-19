import { defineSetting } from "../registry";

const base = { group: "printer", auditable: false, requiresRestart: false } as const;

export const PRINTER_SETTINGS = [
  defineSetting({ ...base, key: "printer.lebar_kertas", type: "enum", default: "58mm", options: ["58mm", "80mm"],
    label: { id: "Lebar kertas printer", en: "Printer paper width" },
    help: { id: "Sesuaikan dengan lebar gulungan kertas printer thermal.", en: "Match the width of the thermal printer paper roll." } }),
  defineSetting({ ...base, key: "printer.timeout_cetak_detik", type: "int", default: 10, min: 5, max: 60,
    label: { id: "Batas waktu cetak (detik)", en: "Print timeout (seconds)" },
    help: { id: "Cetak dianggap gagal bila printer tidak merespons selama waktu ini. Order tetap tersimpan.", en: "Printing fails if the printer does not respond within this time. The order is still saved." } }),
] as const;
