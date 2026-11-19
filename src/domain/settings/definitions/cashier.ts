import { defineSetting } from "../registry";

const base = { group: "kasir", auditable: false, requiresRestart: false } as const;

export const CASHIER_SETTINGS = [
  defineSetting({ ...base, key: "kasir.alasan_maks_karakter", type: "int", default: 200, min: 20, max: 1000,
    label: { id: "Panjang maksimal alasan", en: "Maximum reason length" },
    help: { id: "Batas karakter untuk alasan void, refund, kas keluar, dan koreksi stok.", en: "Character limit for void, refund, cash-out, and stock correction reasons." } }),
  defineSetting({ ...base, key: "kasir.nomor_meja_maks_karakter", type: "int", default: 10, min: 1, max: 20,
    label: { id: "Panjang maksimal nomor meja", en: "Maximum table number length" },
    help: { id: "Batas karakter nomor meja pada keranjang.", en: "Character limit for the table number on the cart." } }),
  defineSetting({ ...base, key: "kasir.nama_pelanggan_maks_karakter", type: "int", default: 50, min: 10, max: 100,
    label: { id: "Panjang maksimal nama pelanggan", en: "Maximum customer name length" },
    help: { id: "Batas karakter nama pelanggan yang diketik di keranjang.", en: "Character limit for the customer name typed on the cart." } }),
  defineSetting({ ...base, key: "kasir.catatan_item_maks_karakter", type: "int", default: 200, min: 10, max: 500,
    label: { id: "Panjang maksimal catatan item", en: "Maximum item note length" },
    help: { id: "Batas karakter catatan untuk satu item di keranjang.", en: "Character limit for a note on one cart item." } }),
  defineSetting({ ...base, key: "kasir.pesanan_ditahan_maks", type: "int", default: 20, min: 1, max: 100,
    label: { id: "Jumlah maksimal pesanan ditahan", en: "Maximum held orders" },
    help: { id: "Pesanan yang ditahan tidak bisa melebihi jumlah ini.", en: "Held orders cannot exceed this count." } }),
  defineSetting({ ...base, key: "kasir.pencarian_maks_karakter", type: "int", default: 50, min: 10, max: 100,
    label: { id: "Panjang maksimal kata pencarian", en: "Maximum search length" },
    help: { id: "Batas karakter kotak pencarian produk.", en: "Character limit for the product search box." } }),
] as const;
