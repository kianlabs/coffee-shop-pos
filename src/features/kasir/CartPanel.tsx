import { ShoppingCart } from "lucide-react";
import { t } from "@/services/i18n";
import { useCartStore } from "@/stores/cartStore";
import { type CartTotals } from "@/stores/useCartTotals";
import { CartHeader } from "./CartHeader";
import { CartLineRow } from "./CartLineRow";
import { CartSummary } from "./CartSummary";
import { HeldOrdersBar } from "./HeldOrdersBar";
import { OrderTypeToggle } from "./OrderTypeToggle";

interface CartPanelProps {
  totals: CartTotals;
  onPay: () => void;
}

/** Header and footer stay put; only the line list scrolls. */
export function CartPanel({ totals, onPay }: CartPanelProps) {
  const lines = useCartStore((s) => s.lines);
  const changeQty = useCartStore((s) => s.changeQty);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card" data-testid="cart-panel">
      <CartHeader itemCount={totals.itemCount} total={totals.total} />
      <HeldOrdersBar />
      <div className="px-4 pt-3">
        <OrderTypeToggle />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {lines.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ShoppingCart className="size-8" aria-hidden />
            <p className="max-w-56 text-sm">{t("kasir.cart.empty")}</p>
          </div>
        ) : (
          <ul className="divide-y" aria-label={t("kasir.cart.items")}>
            {lines.map((line) => (
              <CartLineRow
                key={`${line.productId}-${line.variantId ?? "base"}`}
                line={line}
                onChangeQty={changeQty}
              />
            ))}
          </ul>
        )}
      </div>
      <CartSummary totals={totals} onPay={onPay} />
    </div>
  );
}
