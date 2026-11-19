import { defineSetting } from "../registry";

const base = { group: "keamanan", auditable: true, requiresRestart: false } as const;

export const SECURITY_SETTINGS = [
  defineSetting({ ...base, key: "keamanan.nama_pengguna_maks_karakter", type: "int", default: 40, min: 10, max: 60,
    label: { id: "Panjang maksimal nama pengguna", en: "Maximum username length" },
    help: { id: "Jumlah karakter terbanyak untuk nama tampilan pengguna.", en: "Longest allowed user display name, in characters." } }),
  defineSetting({ ...base, key: "keamanan.pin_panjang_min", type: "int", default: 4, min: 4, max: 6,
    label: { id: "Panjang PIN minimum", en: "Minimum PIN length" },
    help: { id: "PIN baru harus punya paling sedikit angka sebanyak ini.", en: "New PINs need at least this many digits." } }),
  defineSetting({ ...base, key: "keamanan.pin_panjang_maks", type: "int", default: 6, min: 4, max: 8,
    label: { id: "Panjang PIN maksimum", en: "Maximum PIN length" },
    help: { id: "PIN baru paling banyak punya angka sebanyak ini. Tidak boleh lebih kecil dari panjang minimum.", en: "New PINs have at most this many digits. Must not be below the minimum length." } }),
  defineSetting({ ...base, key: "keamanan.maks_percobaan_pin", type: "int", default: 5, min: 3, max: 10,
    label: { id: "Percobaan PIN sebelum terkunci", en: "PIN attempts before lockout" },
    help: { id: "Setelah PIN salah sebanyak ini berturut-turut, akun dikunci sementara.", en: "After this many wrong PINs in a row, the account is locked for a while." } }),
  defineSetting({ ...base, key: "keamanan.durasi_kunci_menit", type: "int", default: 5, min: 1, max: 60,
    label: { id: "Durasi kunci (menit)", en: "Lockout duration (minutes)" },
    help: { id: "Lama akun terkunci setelah terlalu banyak PIN salah.", en: "How long an account stays locked after too many wrong PINs." } }),
  defineSetting({ ...base, key: "keamanan.idle_kunci_menit", type: "int", default: 10, min: 1, max: 60,
    label: { id: "Kunci otomatis saat diam (menit)", en: "Auto-lock when idle (minutes)" },
    help: { id: "Layar terkunci bila tidak ada sentuhan selama waktu ini. Keranjang tetap tersimpan.", en: "The screen locks after this long without a touch. The cart is kept." } }),
] as const;
