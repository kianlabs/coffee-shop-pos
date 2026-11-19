import { defineSetting } from "../registry";

const base = { group: "sinkronisasi", auditable: false, requiresRestart: false } as const;

export const SYNC_SETTINGS = [
  defineSetting({ ...base, key: "sinkronisasi.timeout_detik", type: "int", default: 15, min: 5, max: 60,
    label: { id: "Batas waktu kirim (detik)", en: "Send timeout (seconds)" },
    help: { id: "Pengiriman ke server dianggap gagal setelah waktu ini dan dicoba lagi nanti.", en: "Sending to the server fails after this time and is retried later." } }),
  defineSetting({ ...base, key: "sinkronisasi.jeda_dasar_detik", type: "int", default: 5, min: 1, max: 60,
    label: { id: "Jeda awal coba ulang (detik)", en: "Initial retry delay (seconds)" },
    help: { id: "Jeda sebelum percobaan ulang pertama. Jeda berlipat dua di setiap kegagalan.", en: "Delay before the first retry. The delay doubles after each failure." } }),
  defineSetting({ ...base, key: "sinkronisasi.jeda_maks_detik", type: "int", default: 3600, min: 60, max: 86_400,
    label: { id: "Jeda maksimal coba ulang (detik)", en: "Maximum retry delay (seconds)" },
    help: { id: "Jeda coba ulang tidak pernah lebih lama dari ini.", en: "The retry delay never grows past this." } }),
  defineSetting({ ...base, key: "pembaruan.otomatis", type: "bool", default: true,
    label: { id: "Periksa pembaruan otomatis", en: "Check for updates automatically" },
    help: { id: "Aplikasi memeriksa versi baru secara berkala saat ada internet.", en: "The app checks for new versions periodically when online." } }),
  defineSetting({ ...base, key: "pembaruan.interval_jam", type: "int", default: 24, min: 1, max: 168, requiresRestart: true,
    label: { id: "Interval cek pembaruan (jam)", en: "Update check interval (hours)" },
    help: { id: "Jarak antar pemeriksaan versi baru. Berlaku setelah aplikasi dibuka ulang.", en: "Time between update checks. Applies after the app is reopened." } }),
] as const;
