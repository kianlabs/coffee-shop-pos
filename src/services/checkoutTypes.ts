import type { IngredientQty } from "@/domain/refund";
import type { Rupiah } from "@/domain/money";
import type { PaymentConfig, PaymentEntry } from "@/domain/payments";
import type { Discount, TaxConfig } from "@/domain/taxEngine";
import type { ModifierSnapshot, OrderRecord } from "./ports/orders";

export interface CheckoutLineInput {
  /** Unique cart line key. */
  key: string;
  productId: string;
  name: string;
  qty: number;
  unitPriceRp: Rupiah;
  adjustmentsRp: Rupiah;
  discount?: Discount;
  /** HPP per unit at the moment of sale. */
  hppRp: Rupiah;
  modifiers: ModifierSnapshot[];
  /** Consumption of ONE unit in milli units; multiplied by qty on save. */
  consumptionPerUnit: IngredientQty[];
}

export interface CheckoutPayment extends PaymentEntry {
  reference?: string;
}

export interface CheckoutCommand {
  idempotencyKey: string;
  userId: string;
  lines: CheckoutLineInput[];
  orderDiscount?: Discount;
  payments: CheckoutPayment[];
  /** Settings snapshots, resolved by the caller. */
  tax: TaxConfig;
  paymentConfig: PaymentConfig;
}

export type CheckoutResult =
  | { ok: true; order: OrderRecord; replayed: boolean }
  | { ok: false; code: "invalid" | "failed"; message: string };
