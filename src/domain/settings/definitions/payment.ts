import { defineSetting } from "../registry";

const base = { group: "pembayaran", auditable: true, requiresRestart: false } as const;

export const PAYMENT_METHODS = ["tunai", "qris", "kartu", "transfer", "lainnya"] as const;

export const PAYMENT_SETTINGS = [
  defineSetting({ ...base, key: "pembayaran.metode_aktif", type: "multi", default: PAYMENT_METHODS, options: PAYMENT_METHODS, minSelected: 1,
    label: { id: "Metode bayar aktif", en: "Enabled payment methods" },
    help: { id: "Metode yang tampil di layar pembayaran. Minimal satu metode harus aktif.", en: "Methods shown on the payment screen. At least one must stay enabled." } }),
  defineSetting({ ...base, key: "pembayaran.maks_per_order", type: "int", default: 10, min: 1, max: 20,
    label: { id: "Maksimal pembayaran per order", en: "Maximum payments per order" },
    help: { id: "Jumlah baris pembayaran terbanyak untuk satu order.", en: "Most payment lines allowed on one order." } }),
  defineSetting({ ...base, key: "pembayaran.referensi_maks_karakter", type: "int", default: 64, min: 16, max: 128,
    label: { id: "Panjang maksimal nomor referensi", en: "Maximum reference length" },
    help: { id: "Batas karakter nomor referensi untuk pembayaran non-tunai.", en: "Character limit for the reference number of non-cash payments." } }),
] as const;
