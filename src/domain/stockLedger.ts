// Stock ledger in integer milli units (1 base unit = 1000 milli). Pure.
export const POSITIVE_TYPES = ["purchase_received", "adjustment_in", "return_in"] as const;
export const NEGATIVE_TYPES = ["sale_consumption", "waste", "adjustment_out", "return_out"] as const;
export const MOVEMENT_TYPES = [...POSITIVE_TYPES, ...NEGATIVE_TYPES] as const;

export type PositiveMovementType = (typeof POSITIVE_TYPES)[number];
export type NegativeMovementType = (typeof NEGATIVE_TYPES)[number];
export type MovementType = PositiveMovementType | NegativeMovementType;

export interface Movement {
  ingredientId: string;
  type: MovementType;
  /** Unsigned magnitude in milli units (integer > 0). */
  qtyMilli: number;
}

const POSITIVE_SET: ReadonlySet<string> = new Set(POSITIVE_TYPES);
const NEGATIVE_SET: ReadonlySet<string> = new Set(NEGATIVE_TYPES);

export function isMovementType(value: string): value is MovementType {
  return POSITIVE_SET.has(value) || NEGATIVE_SET.has(value);
}

/** Signed contribution of a movement to system stock. */
export function signedQty(type: MovementType, qtyMilli: number): number {
  if (!Number.isSafeInteger(qtyMilli) || qtyMilli < 0) {
    throw new Error(`Jumlah movement harus integer milli ≥ 0, dapat: ${qtyMilli}.`);
  }
  if (qtyMilli === 0) {
    return 0;
  }
  if (POSITIVE_SET.has(type)) {
    return qtyMilli;
  }
  if (NEGATIVE_SET.has(type)) {
    return -qtyMilli;
  }
  throw new Error(`Jenis movement tidak dikenal: ${String(type)}.`);
}

/** System stock = sum of signed movements. */
export function balance(movements: readonly Movement[]): number {
  let total = 0;
  for (const m of movements) {
    total += signedQty(m.type, m.qtyMilli);
  }
  return total;
}

/**
 * Stocktake plan: one adjustment per counted ingredient whose physical count
 * differs from system stock. Ingredients missing from `physical` are not counted.
 * Output is sorted by ingredient id for determinism.
 */
export function planStocktake(
  system: Readonly<Record<string, number>>,
  physical: Readonly<Record<string, number>>,
): Movement[] {
  const ids = Object.keys(physical).sort();
  const plan: Movement[] = [];
  for (const ingredientId of ids) {
    const counted = physical[ingredientId];
    if (!Number.isSafeInteger(counted) || counted < 0) {
      throw new Error(`Hitungan fisik bahan ${ingredientId} harus integer milli ≥ 0.`);
    }
    const current = system[ingredientId] ?? 0;
    if (!Number.isSafeInteger(current)) {
      throw new Error(`Stok sistem bahan ${ingredientId} bukan integer milli.`);
    }
    const diff = counted - current;
    if (diff === 0) {
      continue;
    }
    const type: MovementType = diff > 0 ? "adjustment_in" : "adjustment_out";
    plan.push({ ingredientId, type, qtyMilli: Math.abs(diff) });
  }
  return plan;
}

/** Shortest decimal representation of |x| without exponent notation. */
function plainDecimal(abs: number): string {
  const s = String(abs);
  if (!/e/i.test(s)) {
    return s;
  }
  return abs.toFixed(12);
}

/**
 * Converts a REAL quantity to integer milli, rounding half away from zero on
 * the decimal representation (1.0005 → 1001, −1.0005 → −1001). Avoids
 * `Math.round(x * 1000)` which suffers from binary error.
 */
export function realToMilli(x: number): number {
  if (!Number.isFinite(x)) {
    throw new Error(`Nilai stok tidak valid untuk konversi milli: ${x}.`);
  }
  const negative = x < 0;
  const [intPart, fracPart = ""] = plainDecimal(Math.abs(x)).split(".");
  const digits = fracPart.padEnd(4, "0");
  let milli = Number(intPart) * 1000 + Number(digits.slice(0, 3));
  if (Number(digits[3]) >= 5) {
    milli += 1;
  }
  if (!Number.isSafeInteger(milli)) {
    throw new Error(`Nilai stok terlalu besar untuk konversi milli: ${x}.`);
  }
  if (milli === 0) {
    return 0;
  }
  return negative ? -milli : milli;
}
