// Integer Rupiah rounding helpers. Every money rounding goes through here.
export type RoundingStep = 100 | 500 | 1000;
function assertSafeNonNegative(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} harus bilangan bulat aman (≤ 2^53 − 1), dapat: ${value}.`);
  }
  if (value < 0) {
    throw new RangeError(`${name} tidak boleh negatif, dapat: ${value}.`);
  }
}
/**
 * n ÷ d rounded half up (remainder ≥ 0.5 rounds up).
 * Throws RangeError when n or d is not a safe integer (e.g. a product that
 * overflowed 2^53), when n < 0, or when d ≤ 0.
 */
export function divRoundHalfUp(n: number, d: number): number {
  assertSafeNonNegative(n, "Pembilang");
  assertSafeNonNegative(d, "Penyebut");
  if (d === 0) {
    throw new RangeError("Penyebut harus lebih dari 0.");
  }
  // % is exact for safe integers; n / d alone can round across an integer.
  const r = n % d;
  const q = (n - r) / d;
  return r * 2 >= d ? q + 1 : q;
}
/**
 * Round total to the nearest multiple of step, half up.
 * roundingRp = rounded − total, so |roundingRp| ≤ step / 2.
 */
export function roundToMultiple(
  total: number,
  step: RoundingStep,
): { rounded: number; roundingRp: number } {
  const rounded = divRoundHalfUp(total, step) * step;
  if (!Number.isSafeInteger(rounded)) {
    throw new RangeError(`Hasil pembulatan melewati batas aman: ${rounded}.`);
  }
  return { rounded, roundingRp: rounded - total };
}
