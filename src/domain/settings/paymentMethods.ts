/** Single list of payment method ids, shared by `payments.ts` and the `pembayaran.metode_aktif` setting. */
export const PAYMENT_METHODS = ["cash", "qris_manual", "card_edc", "bank_transfer", "other"] as const;
export type PaymentMethodId = (typeof PAYMENT_METHODS)[number];
