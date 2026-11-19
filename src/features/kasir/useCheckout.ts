import { useRef, useState } from "react";
import { formatRupiah } from "@/domain/money";
import { repo } from "@/data/orderRepo";
import { errorMessage, notify } from "@/lib/notify";
import { printOrder, receiptText } from "@/lib/printing";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";
import { useCartStore } from "@/stores/cartStore";
import { type CartTotals } from "@/stores/useCartTotals";
import { newIdempotencyKey, staleCartLineMessage } from "./checkoutRules";
import { useKasirUi } from "./kasirUiStore";

interface CheckoutApi {
  processing: boolean;
  checkout: () => Promise<void>;
}

function autoPrint(order: Parameters<typeof printOrder>[0]): void {
  const { storeProfile, posSettings } = useAppStore.getState();
  if (!posSettings.autoPrint) return;
  // The sale is already committed; a failed print never cancels it.
  printOrder(order, storeProfile, posSettings).catch((err: unknown) => {
    notify.error(t("kasir.checkout.printFailed", { reason: errorMessage(err, t("kasir.error.printerNoResponse")) }));
  });
}

/**
 * Commits the cart as an order. One idempotency key per cart composition, so a
 * double tap marks a duplicate instead of creating a second order.
 */
export function useCheckout(totals: CartTotals): CheckoutApi {
  const [processing, setProcessing] = useState(false);
  const keyRef = useRef<{ hash: string; key: string } | null>(null);

  async function checkout(): Promise<void> {
    if (processing) return;
    const cart = useCartStore.getState();
    const app = useAppStore.getState();
    if (cart.lines.length === 0) return notify.error(t("kasir.checkout.emptyCart"));
    if (!app.dbReady) return notify.error(t("kasir.checkout.dbNotReady"));
    const stale = staleCartLineMessage(cart.lines, app.catalog);
    if (stale) return notify.error(stale);

    const amountRp = cart.payMethod === "cash" ? cart.payAmount : totals.total;
    if (cart.payMethod === "cash" && amountRp < totals.total) {
      return notify.error(t("kasir.checkout.underpaid", { amount: formatRupiah(totals.total - amountRp) }));
    }
    const hash = JSON.stringify([cart.lines, totals, cart.payMethod, amountRp, cart.notes.trim()]);
    if (keyRef.current?.hash !== hash) keyRef.current = { hash, key: newIdempotencyKey() };

    setProcessing(true);
    try {
      const typeTag = cart.orderType === "take-away" ? "Take Away" : "Dine In";
      const note = cart.notes.trim();
      const { order, duplicate } = await repo.checkout({
        lines: cart.lines.map((l) => ({ ...l })),
        discountRp: totals.discount,
        taxRp: totals.tax,
        serviceChargeRp: totals.serviceCharge,
        roundingRp: totals.roundingRp,
        payment: { method: cart.payMethod, amountRp, paidAt: new Date().toISOString() },
        notes: `[${typeTag}]${note ? ` ${note}` : ""}`,
        idempotencyKey: keyRef.current.key,
      });
      keyRef.current = null;
      cart.reset();
      app.setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)]);
      const ui = useKasirUi.getState();
      ui.setPaymentOpen(false);
      ui.setCartSheetOpen(false);
      ui.setReceipt({ order, text: receiptText(order, app.storeProfile, app.posSettings) });
      if (duplicate) notify.info(t("kasir.checkout.duplicate", { receipt: order.receiptNumber }));
      autoPrint(order);
    } catch (e) {
      notify.error(errorMessage(e, t("kasir.checkout.failed")));
    } finally {
      setProcessing(false);
    }
  }

  return { processing, checkout };
}
