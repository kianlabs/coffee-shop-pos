import { create } from "zustand";
import { type Order } from "@/domain/orders";

interface Receipt {
  order: Order;
  text: string;
}

interface KasirUiState {
  /** Cart sheet on phones and portrait tablets (< 1024 px). */
  cartSheetOpen: boolean;
  paymentOpen: boolean;
  receipt: Receipt | null;
  setCartSheetOpen: (open: boolean) => void;
  setPaymentOpen: (open: boolean) => void;
  setReceipt: (receipt: Receipt | null) => void;
}

export const useKasirUi = create<KasirUiState>()((set) => ({
  cartSheetOpen: false,
  paymentOpen: false,
  receipt: null,
  setCartSheetOpen: (cartSheetOpen) => set({ cartSheetOpen }),
  setPaymentOpen: (paymentOpen) => set({ paymentOpen }),
  setReceipt: (receipt) => set({ receipt }),
}));
