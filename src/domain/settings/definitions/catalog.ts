import { defineSetting } from "../registry";

// Catalog limits are shown in the cashier group.
const base = { group: "kasir", auditable: false, requiresRestart: false } as const;

export const CATALOG_SETTINGS = [
  defineSetting({ ...base, key: "katalog.nama_maks_karakter", type: "int", default: 50, min: 10, max: 100,
    label: { id: "Panjang maksimal nama produk", en: "Maximum product name length" },
    help: { id: "Batas karakter nama produk, kategori, dan varian.", en: "Character limit for product, category, and variant names." } }),
  defineSetting({ ...base, key: "katalog.modifier_pilihan_maks", type: "int", default: 20, min: 1, max: 50,
    label: { id: "Maksimal pilihan per grup modifier", en: "Maximum choices per modifier group" },
    help: { id: "Jumlah pilihan terbanyak yang boleh dipilih pelanggan dalam satu grup modifier.", en: "Most choices a customer may pick in one modifier group." } }),
  defineSetting({ ...base, key: "katalog.modifier_per_grup_maks", type: "int", default: 20, min: 1, max: 50,
    label: { id: "Maksimal modifier per grup", en: "Maximum modifiers per group" },
    help: { id: "Jumlah modifier terbanyak dalam satu grup modifier.", en: "Most modifiers in one modifier group." } }),
  defineSetting({ ...base, key: "katalog.selisih_harga_maks", type: "int", default: 1_000_000, min: 0, max: 10_000_000,
    label: { id: "Selisih harga modifier maksimal", en: "Maximum modifier price difference" },
    help: { id: "Tambahan atau potongan harga (Rupiah) terbesar untuk satu modifier.", en: "Largest price add-on or reduction (Rupiah) for one modifier." } }),
  defineSetting({ ...base, key: "katalog.harga_maks_rupiah", type: "int", default: 99_999_999, min: 1_000_000, max: 999_999_999,
    label: { id: "Harga produk maksimal", en: "Maximum product price" },
    help: { id: "Harga jual (Rupiah) terbesar yang boleh diisi untuk satu produk.", en: "Highest selling price (Rupiah) allowed for one product." } }),
] as const;
