import { ShoppingCart } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { formatRupiah } from "@/domain/money";
import { t } from "@/services/i18n";
import { useCartTotals } from "@/stores/useCartTotals";
import { CartPanel } from "./CartPanel";
import { CatalogPanel } from "./CatalogPanel";
import { PaymentDialog } from "./PaymentDialog";
import { ReceiptDialog } from "./ReceiptDialog";
import { useKasirUi } from "./kasirUiStore";
import { useCheckout } from "./useCheckout";

/**
 * Landscape tablets (≥ 1024 px) show the catalog and a fixed cart column.
 * Narrower screens show a cart bar that opens the cart as a sheet.
 */
export function KasirScreen() {
  const totals = useCartTotals();
  const { processing, checkout } = useCheckout(totals);
  const sheetOpen = useKasirUi((s) => s.cartSheetOpen);
  const setSheetOpen = useKasirUi((s) => s.setCartSheetOpen);
  const paymentOpen = useKasirUi((s) => s.paymentOpen);
  const setPaymentOpen = useKasirUi((s) => s.setPaymentOpen);
  const openPayment = () => setPaymentOpen(true);

  return (
    <div className="flex h-full min-h-0">
      <CatalogPanel />
      <aside aria-label={t("kasir.cart.region")} className="hidden w-[380px] shrink-0 border-l lg:block xl:w-[420px]">
        <CartPanel totals={totals} onPay={openPayment} />
      </aside>

      {totals.itemCount > 0 && (
        <button
          type="button"
          data-testid="cart-bar"
          onClick={() => setSheetOpen(true)}
          className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 flex h-14 items-center justify-between rounded-lg bg-primary px-4 text-primary-foreground shadow-lg md:bottom-4 md:left-[calc(5.5rem+0.75rem)] lg:hidden"
        >
          <span className="flex items-center gap-2 font-medium">
            <ShoppingCart className="size-5" aria-hidden />
            {t("kasir.cart.viewBar", { count: totals.itemCount })}
          </span>
          <span className="text-lg font-semibold tabular-nums">{formatRupiah(totals.total)}</span>
        </button>
      )}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md lg:hidden">
          <SheetTitle className="sr-only">{t("kasir.cart.region")}</SheetTitle>
          <SheetDescription className="sr-only">{t("kasir.cart.sheetDescription")}</SheetDescription>
          <CartPanel totals={totals} onPay={openPayment} />
        </SheetContent>
      </Sheet>

      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        totals={totals}
        processing={processing}
        onConfirm={() => void checkout()}
      />
      <ReceiptDialog />
    </div>
  );
}
