/**
 * Konversi satuan stok (pure domain, tanpa DB / React).
 *
 * Mendukung konversi metrik:
 * - Massa: mg, g, kg
 * - Volume: ml, l
 * - Hitungan (count): pcs, butir, bungkus, dll. (tidak saling konversi)
 * - Teks bebas (unknown): passthrough hanya jika satuannya sama
 *
 * Aturan:
 * 1. Angka stok dibulatkan ke 3 desimal (roundQty) agar tidak menumpuk float drift.
 * 2. Satuan yang tidak saling kompatibel / tidak dikenal mengembalikan null / false.
 * 3. Tidak ada silent conversion untuk satuan tak dikenal.
 */

export type UnitFamily = "mass" | "volume" | "count" | "unknown";

/** Satuan dasar umum yang ditawarkan di UI picker. */
export const COMMON_BASE_UNITS = ["g", "kg", "ml", "l", "pcs"] as const;

/** Alias pemetaan ke satuan kanonik. */
const ALIAS_MAP: Record<string, string> = {
  // Massa
  mg: "mg",
  miligram: "mg",
  milligram: "mg",
  g: "g",
  gr: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilo: "kg",
  kilogram: "kg",

  // Volume
  ml: "ml",
  mililiter: "ml",
  milliliter: "ml",
  l: "l",
  liter: "l",
  litre: "l",

  // Count / cacah
  pcs: "pcs",
  pc: "pcs",
  piece: "pcs",
  pieces: "pcs",
  buah: "pcs",
  bh: "pcs",
  butir: "butir",
  btr: "butir",
  bungkus: "bungkus",
  bks: "bungkus",
  biji: "biji",
  sachet: "sachet",
  lembar: "lembar",
  lbr: "lembar",
  porsi: "porsi",
  cup: "cup",
  kotak: "kotak",
  botol: "botol",
  btl: "botol",
  kaleng: "kaleng",
  can: "kaleng",
  dus: "dus",
  pak: "pak",
  pack: "pak",
};

const COUNT_CANONICAL = new Set([
  "pcs",
  "butir",
  "bungkus",
  "biji",
  "sachet",
  "lembar",
  "porsi",
  "cup",
  "kotak",
  "botol",
  "kaleng",
  "dus",
  "pak",
]);

/** Pembulatan 3 desimal untuk stok. Menghindari floating-point drift dan -0. */
export function roundQty(qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  const rounded = Math.round(qty * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

/** Normalisasi nama satuan ke bentuk standar huruf kecil tanpa spasi. */
export function normalizeUnit(unit: string): string {
  if (!unit) return "";
  const clean = unit.trim().toLowerCase();
  if (!clean) return "";
  return ALIAS_MAP[clean] ?? clean;
}

/** Tentukan keluarga satuan. */
export function unitFamily(unit: string): UnitFamily {
  const norm = normalizeUnit(unit);
  if (!norm) return "unknown";
  if (norm === "mg" || norm === "g" || norm === "kg") return "mass";
  if (norm === "ml" || norm === "l") return "volume";
  if (COUNT_CANONICAL.has(norm)) return "count";
  return "unknown";
}

/**
 * Cek apakah dua satuan dapat saling dikonversi.
 * - Satuan yang identik selalu true (termasuk satuan hitungan atau teks bebas yang sama).
 * - Massa (mg, g, kg) saling konversi.
 * - Volume (ml, l) saling konversi.
 * - Satuan hitungan berbeda tidak dapat dikonversi (mis. pcs -> butir = false).
 * - Satuan tidak dikenal ke satuan lain = false.
 */
export function isConvertible(from: string, to: string): boolean {
  const normFrom = normalizeUnit(from);
  const normTo = normalizeUnit(to);
  if (!normFrom || !normTo) return false;
  if (normFrom === normTo) return true;
  const familyFrom = unitFamily(normFrom);
  const familyTo = unitFamily(normTo);
  if (familyFrom !== familyTo) return false;
  if (familyFrom === "mass") return true;
  if (familyFrom === "volume") return true;
  return false;
}

/**
 * Konversi kuantitas dari satu satuan ke satuan lain.
 * Mengembalikan kuantitas baru dibulatkan 3 desimal, atau null jika tidak kompatibel.
 */
export function convertQty(qty: number, from: string, to: string): number | null {
  if (!Number.isFinite(qty)) return null;
  if (!isConvertible(from, to)) return null;

  const normFrom = normalizeUnit(from);
  const normTo = normalizeUnit(to);
  if (normFrom === normTo) return roundQty(qty);

  const family = unitFamily(normFrom);
  if (family === "mass") {
    // Konversi ke gram (integer scaling factor)
    let inGrams: number;
    if (normFrom === "kg") inGrams = qty * 1000;
    else if (normFrom === "mg") inGrams = qty / 1000;
    else inGrams = qty;

    let result: number;
    if (normTo === "kg") result = inGrams / 1000;
    else if (normTo === "mg") result = inGrams * 1000;
    else result = inGrams;

    return roundQty(result);
  }

  if (family === "volume") {
    // Konversi ke mililiter
    let inMl: number;
    if (normFrom === "l") inMl = qty * 1000;
    else inMl = qty;

    let result: number;
    if (normTo === "l") result = inMl / 1000;
    else result = inMl;

    return roundQty(result);
  }

  return null;
}

/**
 * Menampilkan kuantitas stok dengan satuan dan padanan yang ramah pengguna.
 * Contoh:
 * - 1500 g -> "1500 g (1.5 kg)"
 * - 500 g -> "500 g"
 * - 0.5 kg -> "0.5 kg (500 g)"
 * - 1500 ml -> "1500 ml (1.5 l)"
 * - 0.25 l -> "0.25 l (250 ml)"
 * - 12 pcs -> "12 pcs"
 */
export function formatQtyWithUnit(qty: number, baseUnit: string): string {
  const safeQty = roundQty(qty);
  const norm = normalizeUnit(baseUnit);
  const unitLabel = baseUnit.trim() || norm;

  if (norm === "g" && Math.abs(safeQty) >= 1000) {
    const inKg = roundQty(safeQty / 1000);
    return `${safeQty} ${unitLabel} (${inKg} kg)`;
  }
  if (norm === "kg" && Math.abs(safeQty) > 0 && Math.abs(safeQty) < 1) {
    const inG = roundQty(safeQty * 1000);
    return `${safeQty} ${unitLabel} (${inG} g)`;
  }
  if (norm === "ml" && Math.abs(safeQty) >= 1000) {
    const inL = roundQty(safeQty / 1000);
    return `${safeQty} ${unitLabel} (${inL} l)`;
  }
  if (norm === "l" && Math.abs(safeQty) > 0 && Math.abs(safeQty) < 1) {
    const inMl = roundQty(safeQty * 1000);
    return `${safeQty} ${unitLabel} (${inMl} ml)`;
  }
  if (norm === "mg" && Math.abs(safeQty) >= 1000) {
    const inG = roundQty(safeQty / 1000);
    return `${safeQty} ${unitLabel} (${inG} g)`;
  }

  return `${safeQty} ${unitLabel}`;
}

/**
 * Daftar satuan yang kompatibel untuk unit picker berdasarkan satuan dasar.
 */
export function getCompatibleUnits(baseUnit: string): string[] {
  const norm = normalizeUnit(baseUnit);
  const family = unitFamily(norm);
  if (family === "mass") {
    const list = ["g", "kg", "mg"];
    if (norm && list.includes(norm)) {
      return [norm, ...list.filter((u) => u !== norm)];
    }
    return list;
  }
  if (family === "volume") {
    const list = ["ml", "l"];
    if (norm && list.includes(norm)) {
      return [norm, ...list.filter((u) => u !== norm)];
    }
    return list;
  }
  return baseUnit ? [baseUnit] : [];
}
