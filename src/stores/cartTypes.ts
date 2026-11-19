import { type Rupiah } from "@/domain/money";
import { type PaymentMethod } from "@/domain/orders";

export interface CartLine {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPriceRp: Rupiah;
  qty: number;
}

export type OrderType = "dine-in" | "take-away";

export interface HeldOrder {
  id: string;
  cart: CartLine[];
  notes: string;
  orderType: OrderType;
  discount: number;
  tax: number;
  total: number;
  heldAt: string;
}

export type { PaymentMethod };
