import { defineSetting } from "../registry";

const base = { group: "pajak", auditable: true, requiresRestart: false } as const;

/** Rates are in basis points: 1100 = 11.00 %. */
export const TAX_SETTINGS = [
  defineSetting({ ...base, key: "pajak.mode", type: "enum", default: "off", options: ["off", "exclusive", "inclusive"],
    label: { id: "Mode pajak", en: "Tax mode" },
    help: { id: "off: tanpa pajak. exclusive: pajak ditambahkan ke harga. inclusive: harga sudah termasuk pajak.", en: "off: no tax. exclusive: tax is added to prices. inclusive: prices already include tax." } }),
  defineSetting({ ...base, key: "pajak.tarif_bp", type: "int", default: 0, min: 0, max: 10_000,
    label: { id: "Tarif pajak (basis poin)", en: "Tax rate (basis points)" },
    help: { id: "100 basis poin = 1%. Contoh: 1100 untuk PPN 11%.", en: "100 basis points = 1%. Example: 1100 for 11% VAT." } }),
  defineSetting({ ...base, key: "pajak.dasar_pengenaan", type: "enum", default: "setelah_diskon", options: ["setelah_diskon", "setelah_diskon_dan_layanan"],
    label: { id: "Dasar pengenaan pajak", en: "Tax base" },
    help: { id: "Pajak dihitung dari subtotal setelah diskon, atau setelah diskon ditambah biaya layanan.", en: "Tax is computed on the subtotal after discounts, or after discounts plus the service charge." } }),
  defineSetting({ ...base, key: "pajak.biaya_layanan_aktif", type: "bool", default: false,
    label: { id: "Aktifkan biaya layanan", en: "Enable service charge" },
    help: { id: "Tambahkan biaya layanan ke setiap order.", en: "Add a service charge to every order." } }),
  defineSetting({ ...base, key: "pajak.biaya_layanan_bp", type: "int", default: 0, min: 0, max: 10_000,
    label: { id: "Biaya layanan (basis poin)", en: "Service charge (basis points)" },
    help: { id: "100 basis poin = 1%. Berlaku bila biaya layanan aktif.", en: "100 basis points = 1%. Applies when the service charge is on." } }),
  defineSetting({ ...base, key: "pajak.pembulatan_aktif", type: "bool", default: false,
    label: { id: "Aktifkan pembulatan", en: "Enable rounding" },
    help: { id: "Bulatkan total order ke kelipatan yang dipilih.", en: "Round the order total to the chosen step." } }),
  defineSetting({ ...base, key: "pajak.pembulatan_kelipatan", type: "int", default: 100, min: 100, max: 1000, allowed: [100, 500, 1000],
    label: { id: "Kelipatan pembulatan", en: "Rounding step" },
    help: { id: "Total dibulatkan ke kelipatan Rupiah ini: 100, 500, atau 1.000.", en: "The total is rounded to this Rupiah step: 100, 500, or 1,000." } }),
] as const;

export const DISCOUNT_SETTINGS = [
  defineSetting({ ...base, group: "diskon", key: "diskon.batas_tanpa_otorisasi_persen", type: "int", default: 10, min: 0, max: 100,
    label: { id: "Diskon maksimal tanpa otorisasi (%)", en: "Maximum discount without approval (%)" },
    help: { id: "Diskon di atas persentase ini butuh persetujuan supervisor atau owner.", en: "Discounts above this percentage need supervisor or owner approval." } }),
] as const;
