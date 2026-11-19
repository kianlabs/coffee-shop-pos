import {
  COMMON_BASE_UNITS,
  convertQty,
  getCompatibleUnits,
  isConvertible,
  normalizeUnit,
} from "@/domain/units";
import { t } from "@/services/i18n";

/** Select value for "create a new ingredient" (Radix Select forbids ""). */
export const NEW_INGREDIENT = "__new__";

/** `labelKey` is translated at render time, so the list follows the active locale. */
export const BASE_UNIT_PRESETS: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: "g", labelKey: "stok.unitPreset.gram" },
  { value: "kg", labelKey: "stok.unitPreset.kilogram" },
  { value: "ml", labelKey: "stok.unitPreset.milliliter" },
  { value: "l", labelKey: "stok.unitPreset.liter" },
  { value: "pcs", labelKey: "stok.unitPreset.pcs" },
  { value: "custom", labelKey: "stok.unitPreset.custom" },
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

function notConvertibleMessage(inputUnit: string, baseUnit: string): string {
  return t("stok.validation.notConvertible", { satuan: inputUnit, dasar: baseUnit });
}

export function planPurchase({ name, baseUnit, inputUnit, qty, costRp }: PurchaseInput): PurchasePlan {
  if (!name) return { ok: false, error: t("stok.validation.nameRequired") };
  if (!baseUnit) return { ok: false, error: t("stok.validation.baseUnitRequired") };
  if (!(qty > 0)) return { ok: false, error: t("stok.validation.qtyPositive") };
  if (!(costRp >= 0)) return { ok: false, error: t("stok.validation.costNegative") };
  if (!isConvertible(inputUnit, baseUnit)) {
    return { ok: false, error: notConvertibleMessage(inputUnit, baseUnit) };
  }
  const convertedQty = convertQty(qty, inputUnit, baseUnit);
  if (convertedQty === null || !(convertedQty > 0)) {
    return { ok: false, error: t("stok.validation.qtyInvalidAfterConvert", { dasar: baseUnit }) };
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
    ? t("stok.message.purchaseWithUnit", { nama: name, qty, satuan: inputUnit, hasil: convertedQty, dasar: baseUnit })
    : t("stok.message.purchase", { nama: name, qty, dasar: baseUnit });
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
  if (ingredientName === null) return { ok: false, error: t("stok.adjust.noIngredient") };
  if (delta === 0) return { ok: false, error: t("stok.validation.deltaZero") };
  if (!reason) return { ok: false, error: t("stok.validation.reasonRequired") };
  if (!isConvertible(inputUnit, baseUnit)) {
    return { ok: false, error: notConvertibleMessage(inputUnit, baseUnit) };
  }
  const convertedDelta = convertQty(delta, inputUnit, baseUnit);
  if (convertedDelta === null || convertedDelta === 0) {
    return { ok: false, error: t("stok.validation.deltaZeroAfterConvert", { dasar: baseUnit }) };
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
    ? t("stok.message.adjustWithUnit", {
        nama: name,
        selisih: signed(delta),
        satuan: inputUnit,
        hasil: signed(convertedDelta),
        dasar: baseUnit,
      })
    : t("stok.message.adjust", { nama: name, hasil: signed(convertedDelta), dasar: baseUnit });
}
