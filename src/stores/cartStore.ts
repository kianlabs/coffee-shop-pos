import { create } from "zustand";
import { unitPriceFor, type Product, type ProductVariant } from "@/domain/catalog";
import { type PaymentMethod } from "@/domain/orders";
import { type CartLine, type HeldOrder, type OrderType } from "./cartTypes";
import { loadHeldOrders, loadStoredCart, saveHeldOrders, saveStoredCart } from "./persistence";

interface CartState {
  lines: CartLine[];
  discount: number;
  tax: number;
  notes: string;
  orderType: OrderType;
  payMethod: PaymentMethod;
  payAmount: number;
  held: HeldOrder[];

  add: (product: Product, variant: ProductVariant | null) => void;
  changeQty: (productId: string, variantId: string | null, delta: number) => void;
  setDiscount: (value: number) => void;
  setTax: (value: number) => void;
  setNotes: (value: string) => void;
  setOrderType: (value: OrderType) => void;
  setPayMethod: (value: PaymentMethod) => void;
  setPayAmount: (value: number) => void;
  /** Empties the cart and resets discount, tax, notes, and payment. */
  reset: () => void;
  hold: (total: number) => void;
  restore: (id: string) => void;
}

const EMPTY_ORDER = {
  lines: [] as CartLine[],
  discount: 0,
  tax: 0,
  notes: "",
  orderType: "dine-in" as OrderType,
  payMethod: "cash" as PaymentMethod,
  payAmount: 0,
};

function sameLine(line: CartLine, productId: string, variantId: string | null): boolean {
  return line.productId === productId && line.variantId === variantId;
}

export const useCartStore = create<CartState>()((set, get) => ({
  ...EMPTY_ORDER,
  lines: loadStoredCart(),
  held: loadHeldOrders(),

  add: (product, variant) => {
    const variantId = variant?.id ?? null;
    set(({ lines }) => {
      if (lines.some((l) => sameLine(l, product.id, variantId))) {
        return {
          lines: lines.map((l) =>
            sameLine(l, product.id, variantId) ? { ...l, qty: l.qty + 1 } : l,
          ),
        };
      }
      const line: CartLine = {
        productId: product.id,
        variantId,
        productName: product.name,
        variantName: variant?.name ?? null,
        unitPriceRp: unitPriceFor(product, variant),
        qty: 1,
      };
      return { lines: [...lines, line] };
    });
  },
  changeQty: (productId, variantId, delta) =>
    set(({ lines }) => ({
      lines: lines
        .map((l) => (sameLine(l, productId, variantId) ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    })),
  setDiscount: (discount) => set({ discount: Math.max(0, discount) }),
  setTax: (tax) => set({ tax: Math.max(0, tax) }),
  setNotes: (notes) => set({ notes }),
  setOrderType: (orderType) => set({ orderType }),
  setPayMethod: (payMethod) => set({ payMethod }),
  setPayAmount: (payAmount) => set({ payAmount: Math.max(0, payAmount) }),
  reset: () => set({ ...EMPTY_ORDER }),
  hold: (total) => {
    const s = get();
    if (s.lines.length === 0) return;
    const entry: HeldOrder = {
      id: `hold-${Date.now()}`,
      cart: [...s.lines],
      notes: s.notes,
      orderType: s.orderType,
      discount: s.discount,
      tax: s.tax,
      total,
      heldAt: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
    };
    set({ ...EMPTY_ORDER, held: [entry, ...s.held] });
  },
  restore: (id) => {
    const entry = get().held.find((h) => h.id === id);
    if (!entry) return;
    set((s) => ({
      ...EMPTY_ORDER,
      lines: entry.cart,
      notes: entry.notes,
      orderType: entry.orderType,
      discount: entry.discount,
      tax: entry.tax,
      held: s.held.filter((h) => h.id !== id),
    }));
  },
}));

useCartStore.subscribe((state, prev) => {
  if (state.lines !== prev.lines) saveStoredCart(state.lines);
  if (state.held !== prev.held) saveHeldOrders(state.held);
});
