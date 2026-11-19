import { defineSetting } from "../registry";

const base = { group: "stok", auditable: true, requiresRestart: false } as const;

export const STOCK_SETTINGS = [
  defineSetting({ ...base, key: "stok.supplier_nama_maks_karakter", type: "int", default: 100, min: 10, max: 200,
    label: { id: "Panjang maksimal nama supplier", en: "Maximum supplier name length" },
    help: { id: "Batas karakter nama supplier.", en: "Character limit for supplier names." } }),
  defineSetting({ ...base, key: "stok.supplier_kontak_maks_karakter", type: "int", default: 100, min: 0, max: 200,
    label: { id: "Panjang maksimal kontak supplier", en: "Maximum supplier contact length" },
    help: { id: "Batas karakter kontak supplier. 0 berarti kontak tidak diisi.", en: "Character limit for supplier contacts. 0 means no contact field." } }),
  defineSetting({ ...base, key: "stok.supplier_catatan_maks_karakter", type: "int", default: 500, min: 0, max: 2000,
    label: { id: "Panjang maksimal catatan supplier", en: "Maximum supplier note length" },
    help: { id: "Batas karakter catatan supplier. 0 berarti catatan tidak diisi.", en: "Character limit for supplier notes. 0 means no note field." } }),
] as const;
