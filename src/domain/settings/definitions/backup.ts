import { defineSetting } from "../registry";

const base = { group: "backup", auditable: true, requiresRestart: false } as const;

export const BACKUP_SETTINGS = [
  defineSetting({ ...base, key: "backup.otomatis_aktif", type: "bool", default: false,
    label: { id: "Backup otomatis saat tutup shift", en: "Automatic backup on shift close" },
    help: { id: "Buat backup terenkripsi setiap kali shift ditutup. Butuh kata sandi dan folder backup.", en: "Create an encrypted backup each time a shift closes. Needs a backup password and folder." } }),
  defineSetting({ ...base, key: "backup.retensi_jumlah", type: "int", default: 14, min: 1, max: 90,
    label: { id: "Jumlah backup otomatis yang disimpan", en: "Automatic backups to keep" },
    help: { id: "Backup otomatis terlama dihapus setelah jumlah ini terlewati. Backup manual tidak dihapus.", en: "The oldest automatic backups are deleted past this count. Manual backups are kept." } }),
  defineSetting({ ...base, key: "backup.peringatan_umur_hari", type: "int", default: 7, min: 1, max: 30,
    label: { id: "Peringatan backup lama (hari)", en: "Old backup warning (days)" },
    help: { id: "Tampilkan peringatan bila backup terakhir lebih tua dari jumlah hari ini.", en: "Show a warning when the last backup is older than this many days." } }),
] as const;
