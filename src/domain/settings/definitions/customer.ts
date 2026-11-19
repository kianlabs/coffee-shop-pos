import { defineSetting } from "../registry";

// Customer, bar queue, and import limits, shown in the cashier group.
const base = { group: "kasir", auditable: false, requiresRestart: false } as const;

export const CUSTOMER_SETTINGS = [
  defineSetting({ ...base, owner: "pelanggan", key: "pelanggan.nama_maks_karakter", type: "int", default: 100, min: 10, max: 200,
    label: { id: "Panjang maksimal nama pelanggan tersimpan", en: "Maximum saved customer name length" },
    help: { id: "Batas karakter nama di data pelanggan.", en: "Character limit for names in customer records." } }),
  defineSetting({ ...base, owner: "pelanggan", key: "pelanggan.telepon_digit_min", type: "int", default: 8, min: 6, max: 10,
    label: { id: "Jumlah digit telepon minimum", en: "Minimum phone digits" },
    help: { id: "Nomor telepon pelanggan harus punya paling sedikit digit sebanyak ini.", en: "Customer phone numbers need at least this many digits." } }),
  defineSetting({ ...base, owner: "pelanggan", key: "pelanggan.telepon_digit_maks", type: "int", default: 15, min: 10, max: 20,
    label: { id: "Jumlah digit telepon maksimum", en: "Maximum phone digits" },
    help: { id: "Nomor telepon pelanggan paling banyak punya digit sebanyak ini.", en: "Customer phone numbers have at most this many digits." } }),
  defineSetting({ ...base, owner: "pelanggan", key: "pelanggan.catatan_maks_karakter", type: "int", default: 200, min: 0, max: 1000,
    label: { id: "Panjang maksimal catatan pelanggan", en: "Maximum customer note length" },
    help: { id: "Batas karakter catatan di data pelanggan. 0 berarti catatan tidak diisi.", en: "Character limit for customer notes. 0 means no note field." } }),
  defineSetting({ ...base, owner: "fnb", key: "bar.ambang_tunggu_menit", type: "int", default: 10, min: 1, max: 60,
    label: { id: "Ambang tunggu antrean bar (menit)", en: "Bar queue wait threshold (minutes)" },
    help: { id: "Order yang menunggu lebih lama dari ini ditandai di antrean bar.", en: "Orders waiting longer than this are highlighted in the bar queue." } }),
  defineSetting({ ...base, key: "impor.ukuran_maks_mb", type: "int", default: 5, min: 1, max: 20,
    label: { id: "Ukuran file impor maksimal (MB)", en: "Maximum import file size (MB)" },
    help: { id: "File CSV yang lebih besar dari ini ditolak.", en: "CSV files larger than this are rejected." } }),
  defineSetting({ ...base, key: "impor.baris_maks", type: "int", default: 5000, min: 100, max: 50_000,
    label: { id: "Jumlah baris impor maksimal", en: "Maximum import rows" },
    help: { id: "File CSV dengan baris lebih banyak dari ini ditolak.", en: "CSV files with more rows than this are rejected." } }),
] as const;
