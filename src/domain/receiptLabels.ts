import type { ReceiptLang } from "./receiptText";

export interface ReceiptLabels {
  receiptNo: string;
  date: string;
  cashier: string;
  orderType: string;
  note: string;
  subtotal: string;
  discount: string;
  serviceCharge: string;
  tax: string;
  rounding: string;
  total: string;
  change: string;
  copy: string;
  void: string;
  refund: string;
  kitchen: string;
  thanks: string;
  /** Payment method code (e.g. "cash") to display name. */
  payment: Record<string, string>;
}

/** Defaults so callers without a translation catalogue still work. */
export const DEFAULT_RECEIPT_LABELS: Record<ReceiptLang, ReceiptLabels> = {
  id: {
    receiptNo: "No", date: "Tgl", cashier: "Kasir", orderType: "Tipe", note: "Ket",
    subtotal: "Subtotal", discount: "Diskon", serviceCharge: "Layanan", tax: "Pajak",
    rounding: "Pembulatan", total: "TOTAL", change: "Kembalian", copy: "SALINAN",
    void: "*** VOID ***", refund: "*** REFUND ***", kitchen: "DAPUR", thanks: "Terima kasih",
    payment: { cash: "Tunai", qris_manual: "QRIS", other: "Lainnya" },
  },
  en: {
    receiptNo: "No", date: "Date", cashier: "Cashier", orderType: "Type", note: "Note",
    subtotal: "Subtotal", discount: "Discount", serviceCharge: "Service", tax: "Tax",
    rounding: "Rounding", total: "TOTAL", change: "Change", copy: "COPY",
    void: "*** VOID ***", refund: "*** REFUND ***", kitchen: "KITCHEN", thanks: "Thank you",
    payment: { cash: "Cash", qris_manual: "QRIS", other: "Other" },
  },
};
