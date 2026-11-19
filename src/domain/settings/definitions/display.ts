import { defineSetting } from "../registry";

const language = { group: "bahasa", auditable: false, requiresRestart: false } as const;
const display = { group: "tampilan", auditable: false, requiresRestart: false } as const;

export const LANGUAGE_SETTINGS = [
  defineSetting({ ...language, key: "bahasa.antarmuka", type: "enum", default: "id", options: ["id", "en"],
    label: { id: "Bahasa antarmuka", en: "Interface language" },
    help: { id: "Bahasa semua teks di layar. Berganti langsung tanpa memuat ulang.", en: "Language of all on-screen text. Switches immediately without reloading." } }),
  defineSetting({ ...language, key: "bahasa.format_lokal", type: "enum", default: "id", options: ["id", "en"],
    label: { id: "Format angka dan tanggal", en: "Number and date format" },
    help: { id: "id: 1.000,50. en: 1,000.50. Tanggal tetap DD/MM/YYYY.", en: "id: 1.000,50. en: 1,000.50. Dates stay DD/MM/YYYY." } }),
] as const;

export const DISPLAY_SETTINGS = [
  defineSetting({ ...display, key: "tampilan.durasi_toast_detik", type: "int", default: 3, min: 2, max: 10,
    label: { id: "Lama notifikasi (detik)", en: "Notification duration (seconds)" },
    help: { id: "Lama notifikasi singkat tampil di layar.", en: "How long short notifications stay on screen." } }),
  defineSetting({ ...display, key: "tampilan.audit_per_halaman", type: "int", default: 50, min: 10, max: 200,
    label: { id: "Entri log audit per halaman", en: "Audit log entries per page" },
    help: { id: "Jumlah baris log audit yang dimuat sekaligus.", en: "Number of audit log rows loaded at once." } }),
  defineSetting({ ...display, key: "tampilan.kontras_tinggi", type: "bool", default: false,
    label: { id: "Mode kontras tinggi", en: "High contrast mode" },
    help: { id: "Warna dengan kontras lebih kuat untuk ruangan terang.", en: "Stronger contrast colors for bright rooms." } }),
  defineSetting({ ...display, key: "laporan.rentang_maks_hari", type: "int", default: 366, min: 31, max: 1000,
    label: { id: "Rentang laporan maksimal (hari)", en: "Maximum report range (days)" },
    help: { id: "Rentang tanggal terpanjang untuk satu laporan atau ekspor.", en: "Longest date range for one report or export." } }),
] as const;
