// Split_Bill: divide an order total into per-person or per-item bills (Req 30.1).
import type { Rupiah } from "./money";
import type { Totals } from "./taxEngine";
import { allocateLargestRemainder as allocateByWeights } from "./taxEngineInput";

function assertBills(bills: number): void {
  if (!Number.isSafeInteger(bills) || bills < 1) {
    throw new RangeError("Jumlah tagihan harus bilangan bulat ≥ 1.");
  }
}

/**
 * Split `total` by non-negative integer `weights` with the largest remainder
 * method. Remainder ties go to the lowest index. Σ result = total, no share
 * is negative. All-zero weights fall back to equal weights.
 */
export function allocateLargestRemainder(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError("Total yang dibagi harus bilangan bulat ≥ 0.");
  }
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new RangeError("Bobot pembagian harus bilangan bulat ≥ 0.");
  }
  if (weights.length === 0) {
    if (total === 0) return [];
    throw new RangeError("Tidak ada tagihan untuk menerima pembagian.");
  }
  const hasWeight = weights.some((w) => w > 0);
  return allocateByWeights(total, hasWeight ? weights : weights.map(() => 1));
}

/** Equal split into `bills` shares; the extra Rupiah go to the lowest indexes. */
export function splitEqually(totalRp: Rupiah, bills: number): number[] {
  assertBills(bills);
  return allocateLargestRemainder(totalRp, Array.from({ length: bills }, () => 1));
}

/** Split by line assignment: weight of a bill = Σ chargeTotalRp of its lines. */
export function splitByItems(totals: Totals, assignment: Record<string, number>, bills: number): number[] {
  assertBills(bills);
  const weights = Array.from({ length: bills }, () => 0);
  for (const line of totals.lines) {
    const idx = Object.hasOwn(assignment, line.key) ? assignment[line.key] : undefined;
    if (idx === undefined) throw new RangeError(`Baris ${line.key} belum ditugaskan ke tagihan.`);
    if (!Number.isInteger(idx) || idx < 0 || idx >= bills) {
      throw new RangeError(`Indeks tagihan baris ${line.key} di luar rentang.`);
    }
    weights[idx] += line.chargeTotalRp;
  }
  return allocateLargestRemainder(totals.totalRp, weights);
}
