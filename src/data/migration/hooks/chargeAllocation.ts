/**
 * Splits `total` over lines in proportion to `weights`. Rounds down per line and hands the remaining
 * rupiah to the heaviest lines first, so the shares always add up to exactly `total`. Pure.
 */
export function allocateProportional(weights: readonly number[], total: number): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return weights.map(() => 0);
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const shares = weights.map((w) => Number((BigInt(w) * BigInt(total)) / BigInt(sum)));
  let remainder = total - shares.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) shares[order[k].i] += 1;
  return shares;
}
