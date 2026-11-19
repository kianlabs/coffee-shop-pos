import {
  COMMON_BASE_UNITS,
  convertQty,
  getCompatibleUnits,
  isConvertible,
  normalizeUnit,
} from "@/domain/units";

/** Select value for "create a new ingredient" (Radix Select forbids ""). */
export const NEW_INGREDIENT = "__new__";

export const BASE_UNIT_PRESETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "g", label: "gram (g)" },
  { value: "kg", label: "kilogram (kg)" },
  { value: "ml", label: "mililiter (ml)" },
  { value: "l", label: "liter (l)" },
  { value: "pcs", label: "pcs" },
  { value: "custom", label: "Lainnya (bebas)…" },
];

export function slugId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `ing-${base || "bahan"}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Base unit first, then compatible units, then the common ones. */
export function unitOptionsFor(baseUnit: string): string[] {
  const set = new Set<string>();
  if (baseUnit) set.add(baseUnit);
  for (const u of getCompatibleUnits(baseUnit)) set.add(u);
  for (const u of COMMON_BASE_UNITS) set.add(u);
  return Array.from(set).filter((u) => u.length > 0);
}

export function parseQty(raw: string, allowNegative: boolean): number {
  const n = Number(raw) || 0;
  return allowNegative ? n : Math.max(0, n);
}

interface PurchaseInput {
  name: string;
  baseUnit: string;
  inputUnit: string;
  qty: number;
  costRp: number;
}

type PurchasePlan =
  | { ok: true; convertedQty: number; costPerBaseUnit: number }
  | { ok: false; error: string };

export function planPurchase({ name, baseUnit, inputUnit, qty, costRp }: PurchaseInput): PurchasePlan {
  if (!name) return { ok: false, error: "Nama bahan wajib diisi." };
  if (!baseUnit) return { ok: false, error: "Satuan dasar bahan wajib diisi." };
  if (!(qty > 0)) return { ok: false, error: "Jumlah pembelian harus lebih dari 0." };
  if (!(costRp >= 0)) return { ok: false, error: "Harga per satuan tidak boleh negatif." };
  if (!isConvertible(inputUnit, baseUnit)) {
    return {
      ok: false,
      error: `Satuan "${inputUnit}" tidak dapat dikonversi ke satuan dasar "${baseUnit}".`,
    };
  }
  const convertedQty = convertQty(qty, inputUnit, baseUnit);
  if (convertedQty === null || !(convertedQty > 0)) {
    return { ok: false, error: `Jumlah pembelian tidak valid setelah konversi ke "${baseUnit}".` };
  }
  // Total belanja = qty × harga per satuan input; dibagi qty dalam satuan dasar.
  const costPerBaseUnit = Math.round(((qty * costRp) / convertedQty) * 100) / 100;
  return { ok: true, convertedQty, costPerBaseUnit };
}

export function purchaseMessage(
  name: string,
  qty: number,
  inputUnit: string,
  convertedQty: number,
  baseUnit: string,
): string {
  return normalizeUnit(inputUnit) !== normalizeUnit(baseUnit)
    ? `Pembelian ${name} ${qty} ${inputUnit} (${convertedQty} ${baseUnit}) dicatat.`
    : `Pembelian ${name} ${qty} ${baseUnit} dicatat.`;
}

/** Converted quantity and price per base unit, shown under the purchase form. */
export function purchaseConversion(
  qty: number,
  costRp: number,
  inputUnit: string,
  baseUnit: string,
): { qty: number; costPerBaseRp: number } | null {
  if (!baseUnit || normalizeUnit(inputUnit) === normalizeUnit(baseUnit)) return null;
  if (!isConvertible(inputUnit, baseUnit)) return null;
  const converted = convertQty(qty, inputUnit, baseUnit);
  return { qty: converted ?? 0, costPerBaseRp: Math.round((qty * costRp) / (converted || 1)) };
}

interface AdjustInput {
  ingredientName: string | null;
  baseUnit: string;
  inputUnit: string;
  delta: number;
  reason: string;
}

type AdjustPlan = { ok: true; convertedDelta: number } | { ok: false; error: string };

export function planAdjust({ ingredientName, baseUnit, inputUnit, delta, reason }: AdjustInput): AdjustPlan {
  if (ingredientName === null) return { ok: false, error: "Pilih bahan yang mau dikoreksi." };
  if (delta === 0) return { ok: false, error: "Selisih tidak boleh 0." };
  if (!reason) return { ok: false, error: "Alasan koreksi wajib diisi." };
  if (!isConvertible(inputUnit, baseUnit)) {
    return {
      ok: false,
      error: `Satuan "${inputUnit}" tidak dapat dikonversi ke satuan dasar "${baseUnit}".`,
    };
  }
  const convertedDelta = convertQty(delta, inputUnit, baseUnit);
  if (convertedDelta === null || convertedDelta === 0) {
    return { ok: false, error: `Selisih tidak boleh nol setelah konversi ke "${baseUnit}".` };
  }
  return { ok: true, convertedDelta };
}

const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

export function adjustMessage(
  name: string,
  delta: number,
  inputUnit: string,
  convertedDelta: number,
  baseUnit: string,
): string {
  return normalizeUnit(inputUnit) !== normalizeUnit(baseUnit)
    ? `Koreksi stok ${name} ${signed(delta)} ${inputUnit} (${signed(convertedDelta)} ${baseUnit}) tersimpan.`
    : `Koreksi stok ${name} ${signed(convertedDelta)} ${baseUnit} tersimpan.`;
}
