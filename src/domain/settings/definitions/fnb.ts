import { defineSetting } from "../registry";

// F&B module switches, shown in the cashier group.
const base = { group: "kasir", auditable: false, requiresRestart: false, owner: "fnb" } as const;

function toggle<const K extends string>(key: K, label: { id: string; en: string }, help: { id: string; en: string }) {
  return defineSetting({ ...base, key, type: "bool", default: false, label, help });
}

export const FNB_SETTINGS = [
  defineSetting({ ...base, key: "fnb.nomor_antrean_jam_reset", type: "text", default: "00:00", maxLength: 5, format: "time",
    label: { id: "Jam reset nomor antrean", en: "Queue number reset time" },
    help: { id: "Nomor antrean kembali ke 1 setiap hari pada jam ini (format JJ:mm).", en: "The queue number goes back to 1 every day at this time (HH:mm)." } }),
  toggle("fnb.split_bill_aktif", { id: "Aktifkan split bill", en: "Enable split bill" },
    { id: "Kasir bisa memecah tagihan per orang atau per item.", en: "Cashiers can split a bill per person or per item." }),
  toggle("fnb.nomor_antrean_aktif", { id: "Aktifkan nomor antrean", en: "Enable queue numbers" },
    { id: "Setiap order mendapat nomor antrean harian di struk dan antrean bar.", en: "Each order gets a daily queue number on the receipt and bar queue." }),
  toggle("fnb.struk_digital_aktif", { id: "Aktifkan struk digital", en: "Enable digital receipts" },
    { id: "Struk bisa dibagikan lewat share sheet Android, misalnya WhatsApp.", en: "Receipts can be shared through the Android share sheet, for example WhatsApp." }),
  toggle("fnb.printer_dapur_aktif", { id: "Aktifkan printer dapur", en: "Enable kitchen printer" },
    { id: "Item dicetak ke printer dapur sesuai kategori.", en: "Items are printed to the kitchen printer by category." }),
  toggle("fnb.promo_aktif", { id: "Aktifkan promo", en: "Enable promotions" },
    { id: "Promo dan voucher bisa dipakai di keranjang.", en: "Promotions and vouchers can be used on the cart." }),
  toggle("fnb.pengeluaran_aktif", { id: "Aktifkan pengeluaran", en: "Enable expenses" },
    { id: "Pengeluaran operasional bisa dicatat dari laci kas.", en: "Operating expenses can be recorded from the cash drawer." }),
  toggle("fnb.item_cepat_aktif", { id: "Aktifkan item cepat", en: "Enable quick items" },
    { id: "Kasir bisa menambah item tanpa produk di katalog, dengan persetujuan.", en: "Cashiers can add items that are not in the catalog, with approval." }),
  toggle("fnb.foto_produk_aktif", { id: "Aktifkan foto produk", en: "Enable product photos" },
    { id: "Owner bisa mengunggah foto produk yang disimpan di perangkat.", en: "The owner can upload product photos stored on the device." }),
  toggle("fnb.open_bill_aktif", { id: "Aktifkan open bill", en: "Enable open bills" },
    { id: "Order bisa dibiarkan terbuka dan dibayar belakangan.", en: "Orders can stay open and be paid later." }),
  defineSetting({ ...base, key: "fnb.foto_ukuran_maks_kb", type: "int", default: 512, min: 50, max: 5000,
    label: { id: "Ukuran foto maksimal (KB)", en: "Maximum photo size (KB)" },
    help: { id: "Foto produk yang lebih besar dari ini ditolak.", en: "Product photos larger than this are rejected." } }),
  defineSetting({ ...base, key: "fnb.foto_format", type: "enum", default: "jpeg", options: ["jpeg", "png", "webp"],
    label: { id: "Format foto produk", en: "Product photo format" },
    help: { id: "Format file yang diterima untuk foto produk.", en: "File format accepted for product photos." } }),
] as const;
