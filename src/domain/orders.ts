import { calcLineTotal, calcSubtotal, calcTotal, type Rupiah } from "./money";

export type OrderLineInput = {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPriceRp: Rupiah;
  qty: number;
};

export type OrderLine = OrderLineInput & {
  lineTotalRp: Rupiah;
  /** Bagian diskon order yang dibebankan ke baris ini (integer Rupiah). */
  discountRp: Rupiah;
  /** lineTotalRp - discountRp. */
  netTotalRp: Rupiah;
  /** Snapshot HPP baris (terisi saat order dibaca dari DB; 0 saat checkout baru). */
  hppTotal?: Rupiah;
};

export type PaymentMethod = "cash" | "qris_manual" | "other";

export type Payment = {
  method: PaymentMethod;
  amountRp: Rupiah;
  paidAt: string;
};

export type Order = {
  id: string;
  receiptNumber: string;
  idempotencyKey: string;
  status: "completed" | "voided" | "refunded";
  lines: OrderLine[];
  subtotalRp: Rupiah;
  discountRp: Rupiah;
  taxRp: Rupiah;
  serviceChargeRp: Rupiah;
  roundingRp: Rupiah;
  totalRp: Rupiah;
  payment: Payment;
  changeRp: Rupiah;
  notes: string | null;
  createdAt: string;
};

export type CheckoutInput = {
  lines: OrderLineInput[];
  discountRp?: Rupiah;
  taxRp?: Rupiah;
  serviceChargeRp?: Rupiah;
  roundingRp?: Rupiah;
  payment: Payment;
  notes?: string | null;
  idempotencyKey: string;
};

/**
 * Bagi diskon order ke tiap baris secara proporsional terhadap lineTotalRp.
 * Pembulatan ke bawah per baris, sisa 1-rupiah diberikan ke baris terbesar
 * supaya jumlah alokasi selalu tepat sama dengan diskon order.
 */
export function allocateDiscount(
  lineTotals: Rupiah[],
  discountRp: Rupiah,
): Rupiah[] {
  const total = lineTotals.reduce((a, b) => a + b, 0);
  if (discountRp <= 0 || total <= 0) {
    return lineTotals.map(() => 0);
  }
  const capped = Math.min(discountRp, total);
  const shares = lineTotals.map((lt) => Math.floor((lt * capped) / total));
  let remainder = capped - shares.reduce((a, b) => a + b, 0);
  // Sisa dibagikan ke baris dengan nilai terbesar (deterministik).
  const order = lineTotals
    .map((lt, idx) => ({ lt, idx }))
    .sort((a, b) => b.lt - a.lt);
  let i = 0;
  while (remainder > 0 && order.length > 0) {
    shares[order[i % order.length].idx] += 1;
    remainder -= 1;
    i += 1;
  }
  return shares;
}

function buildOrderLines(lines: OrderLineInput[], discountRp: Rupiah): OrderLine[] {
  const gross = lines.map((l) => calcLineTotal(l.unitPriceRp, l.qty));
  const shares = allocateDiscount(gross, discountRp);
  return lines.map((l, idx) => ({
    ...l,
    lineTotalRp: gross[idx],
    discountRp: shares[idx],
    netTotalRp: gross[idx] - shares[idx],
  }));
}

export type OrderStatus = Order["status"];

const ORDER_STATUSES: readonly string[] = ["completed", "voided", "refunded"];

export function validateOrderStatus(status: string): string | null {
  if (status === "partially_refunded" || status === "draft") {
    return `Status order "${status}" tidak didukung; gunakan completed/voided/refunded.`;
  }
  if (!ORDER_STATUSES.includes(status)) {
    return `Status order tidak dikenal: ${status}.`;
  }
  return null;
}

/**
 * Validasi transisi status order: hanya order completed yang boleh
 * di-void atau di-refund. Transisi dari voided/refunded ke status lain tidak diizinkan.
 */
export function canTransitionOrderStatus(
  current: OrderStatus,
  target: OrderStatus,
): { allowed: boolean; error: string | null } {
  if (current === target) {
    return { allowed: false, error: `Order sudah berstatus ${current}.` };
  }
  if (current !== "completed") {
    return {
      allowed: false,
      error: "Order sudah di-void/refund atau tidak ditemukan.",
    };
  }
  if (target !== "voided" && target !== "refunded") {
    return { allowed: false, error: `Transisi status ke ${target} tidak diizinkan.` };
  }
  return { allowed: true, error: null };
}

export function validateCheckout(input: CheckoutInput): string | null {
  if (input.lines.length === 0) {
    return "Keranjang kosong.";
  }
  for (const l of input.lines) {
    if (!Number.isInteger(l.qty) || l.qty <= 0) {
      return `Qty tidak valid untuk ${l.productName}.`;
    }
    if (!Number.isInteger(l.unitPriceRp) || l.unitPriceRp <= 0) {
      return `Harga tidak valid untuk ${l.productName}.`;
    }
  }
  const discount = input.discountRp ?? 0;
  const tax = input.taxRp ?? 0;
  const serviceCharge = input.serviceChargeRp ?? 0;
  const rounding = input.roundingRp ?? 0;
  if (!Number.isInteger(discount) || !Number.isInteger(tax)) {
    return "Diskon/pajak harus bilangan bulat Rupiah.";
  }
  if (discount < 0 || tax < 0) {
    return "Diskon/pajak tidak boleh negatif.";
  }
  if (!Number.isInteger(serviceCharge) || serviceCharge < 0) {
    return "Biaya layanan harus bilangan bulat Rupiah ≥ 0.";
  }
  if (!Number.isInteger(rounding) || rounding > 0) {
    return "Pembulatan harus bilangan bulat Rupiah ≤ 0.";
  }
  const subtotal = calcSubtotal(input.lines);
  if (discount > subtotal) {
    return "Diskon melebihi subtotal.";
  }
  const total = calcTotal(subtotal, discount, tax, serviceCharge, rounding);
  if (!Number.isInteger(input.payment.amountRp)) {
    return "Nominal bayar harus bilangan bulat Rupiah.";
  }
  if (input.payment.amountRp < total) {
    return "Nominal bayar kurang dari total.";
  }
  if (
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.length === 0 ||
    input.idempotencyKey.length > 128
  ) {
    return "Idempotency key tidak valid.";
  }
  if (
    input.payment.method !== "cash" &&
    input.payment.method !== "qris_manual" &&
    input.payment.method !== "other"
  ) {
    return "Metode bayar tidak valid.";
  }
  if (typeof input.payment.paidAt !== "string" || Number.isNaN(Date.parse(input.payment.paidAt))) {
    return "Tanggal bayar tidak valid.";
  }
  if (
    input.notes !== undefined &&
    input.notes !== null &&
    (typeof input.notes !== "string" || input.notes.length > 1000)
  ) {
    return "Catatan maksimal 1000 karakter.";
  }
  return null;
}

function receiptRandomSuffix(): string {
  try {
    if (typeof globalThis === "object" && "crypto" in globalThis) {
      const cryptoObj: unknown = globalThis.crypto;
      if (
        typeof cryptoObj === "object" &&
        cryptoObj !== null &&
        "getRandomValues" in cryptoObj &&
        typeof cryptoObj.getRandomValues === "function"
      ) {
        const bytes = new Uint8Array(3);
        cryptoObj.getRandomValues(bytes);
        const n = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
        const s = n.toString(36).toUpperCase().padStart(4, "0");
        return s.length > 4 ? s.slice(-4) : s;
      }
    }
  } catch {
    // Abaikan: fallback ke Math.random di bawah.
  }
  const n = Math.floor(Math.random() * 36 ** 4);
  return n.toString(36).toUpperCase().padStart(4, "0");
}

export function createCompletedOrder(input: CheckoutInput, now: Date): Order {
  const discount = input.discountRp ?? 0;
  const built = buildOrderLines(input.lines, discount);
  const subtotal = calcSubtotal(built);
  const tax = input.taxRp ?? 0;
  const serviceCharge = input.serviceChargeRp ?? 0;
  const rounding = input.roundingRp ?? 0;
  const total = calcTotal(subtotal, discount, tax, serviceCharge, rounding);
  const createdAt = now.toISOString();
  return {
    id: input.idempotencyKey,
    receiptNumber: `R-${now.getTime().toString(36).toUpperCase()}-${receiptRandomSuffix()}`,
    idempotencyKey: input.idempotencyKey,
    status: "completed",
    lines: built,
    subtotalRp: subtotal,
    discountRp: discount,
    taxRp: tax,
    serviceChargeRp: serviceCharge,
    roundingRp: rounding,
    totalRp: total,
    payment: input.payment,
    changeRp: input.payment.amountRp - total,
    notes: input.notes ?? null,
    createdAt,
  };
}
