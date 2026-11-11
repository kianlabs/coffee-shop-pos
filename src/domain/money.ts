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

/**
 * Format angka atau string angka dengan pemisah ribuan titik (standar id-ID) tanpa prefix 'Rp'.
 * Contoh: 10000 -> "10.000", "500000" -> "500.000", 0 -> "0", "" -> ""
 */
export function formatThousands(value: number | string | null | undefined): string {
  if (value === "" || value === null || value === undefined) return "";
  const str = String(value).trim();
  if (str === "") return "";
  const isNegative = str.startsWith("-");
  const digits = str.replace(/\D/g, "");
  if (!digits) return isNegative ? "-" : "";
  const num = Number(digits);
  const formatted = num.toLocaleString("id-ID");
  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Parsing string berformat ribuan bertitik menjadi integer murni (Rupiah).
 * Mengabaikan karakter non-digit (termasuk titik pemisah dan prefix 'Rp').
 * Contoh: "10.000" -> 10000, "Rp 50.000" -> 50000, "" -> 0, "50000" -> 50000
 */
export function parseThousands(value: string | number | null | undefined): Rupiah {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    const clamped = Math.trunc(value);
    if (!Number.isSafeInteger(clamped) || clamped > 999_999_999_999) return 999_999_999_999;
    if (clamped < -999_999_999_999) return -999_999_999_999;
    return clamped;
  }
  if (!value) return 0;
  const str = String(value).trim();
  const isNegative = str.startsWith("-");
  const digits = str.replace(/\D/g, "");
  if (!digits) return 0;
  let num = parseInt(digits, 10);
  if (!Number.isSafeInteger(num) || num > 999_999_999_999) {
    num = 999_999_999_999;
  }
  return isNegative ? -num : num;
}
