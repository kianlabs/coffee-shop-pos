export type Rupiah = number;

export function calcLineTotal(unitPriceRp: Rupiah, qty: number): Rupiah {
  if (unitPriceRp <= 0) {
    return 0;
  }
  if (qty <= 0) {
    return 0;
  }
  const total: Rupiah = unitPriceRp * qty;
  return total;
}

export function calcSubtotal(lines: Array<{ unitPriceRp: Rupiah; qty: number }>): Rupiah {
  let subtotal = 0;
  for (const line of lines) {
    subtotal += calcLineTotal(line.unitPriceRp, line.qty);
  }
  return subtotal;
}

export function calcTotal(
  subtotalRp: Rupiah,
  discountRp: Rupiah,
  taxRp: Rupiah,
  serviceChargeRp: Rupiah = 0,
  roundingRp: Rupiah = 0,
): Rupiah {
  const discount = discountRp < 0 ? 0 : discountRp;
  const tax = taxRp < 0 ? 0 : taxRp;
  const service = serviceChargeRp < 0 ? 0 : serviceChargeRp;
  const total = subtotalRp - discount + tax + service + roundingRp;
  return total < 0 ? 0 : total;
}

export function formatRupiah(amountRp: Rupiah): string {
  const safe = Number.isFinite(amountRp) ? Math.trunc(amountRp) : 0;
  return "Rp" + safe.toLocaleString("id-ID");
}
