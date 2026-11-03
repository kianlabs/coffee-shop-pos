import { calcLineTotal, calcSubtotal, type Rupiah } from "./money";

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
  payment: Payment;
  notes?: string | null;
  idempotencyKey: string;
};

export function buildOrderLines(lines: OrderLineInput[]): OrderLine[] {
  return lines.map((l) => ({
    ...l,
    lineTotalRp: calcLineTotal(l.unitPriceRp, l.qty),
  }));
}

export function validateCheckout(input: CheckoutInput): string | null {
  if (input.lines.length === 0) {
    return "Keranjang kosong.";
  }
  for (const l of input.lines) {
    if (l.qty <= 0) {
      return `Qty tidak valid untuk ${l.productName}.`;
    }
    if (l.unitPriceRp < 0) {
      return `Harga tidak valid untuk ${l.productName}.`;
    }
  }
  const discount = input.discountRp ?? 0;
  const tax = input.taxRp ?? 0;
  if (discount < 0 || tax < 0) {
    return "Diskon/pajak tidak boleh negatif.";
  }
  const subtotal = calcSubtotal(input.lines);
  if (discount > subtotal) {
    return "Diskon melebihi subtotal.";
  }
  const total = subtotal - discount + tax;
  if (input.payment.amountRp < total) {
    return "Nominal bayar kurang dari total.";
  }
  return null;
}

export function createCompletedOrder(input: CheckoutInput, now: Date): Order {
  const built = buildOrderLines(input.lines);
  const subtotal = calcSubtotal(built);
  const discount = input.discountRp ?? 0;
  const tax = input.taxRp ?? 0;
  const total = subtotal - discount + tax;
  const createdAt = now.toISOString();
  return {
    id: input.idempotencyKey,
    receiptNumber: `R-${now.getTime().toString(36).toUpperCase()}`,
    idempotencyKey: input.idempotencyKey,
    status: "completed",
    lines: built,
    subtotalRp: subtotal,
    discountRp: discount,
    taxRp: tax,
    totalRp: total,
    payment: input.payment,
    changeRp: input.payment.amountRp - total,
    notes: input.notes ?? null,
    createdAt,
  };
}
