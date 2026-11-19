import { memo } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/domain/money";
import { t } from "@/services/i18n";
import { type CartLine } from "@/stores/cartTypes";

interface CartLineRowProps {
  line: CartLine;
  onChangeQty: (productId: string, variantId: string | null, delta: number) => void;
}

export const CartLineRow = memo(function CartLineRow({ line, onChangeQty }: CartLineRowProps) {
  const label = `${line.productName}${line.variantName ? ` ${line.variantName}` : ""}`;
  return (
    <li data-testid="cart-line" className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{line.productName}</p>
        <p className="truncate text-sm text-muted-foreground tabular-nums">
          {line.variantName ? `${line.variantName} · ` : ""}
          {formatRupiah(line.unitPriceRp)}
        </p>
      </div>
      <div className="flex items-center rounded-md border">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("kasir.line.decrease", { label })}
          onClick={() => onChangeQty(line.productId, line.variantId, -1)}
        >
          <Minus />
        </Button>
        <span className="w-7 text-center text-sm font-semibold tabular-nums" aria-label={t("kasir.line.qty", { qty: line.qty })}>
          {line.qty}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("kasir.line.increase", { label })}
          onClick={() => onChangeQty(line.productId, line.variantId, 1)}
        >
          <Plus />
        </Button>
      </div>
      <span data-testid="cart-line-total" className="w-24 text-right font-semibold tabular-nums">
        {formatRupiah(line.unitPriceRp * line.qty)}
      </span>
    </li>
  );
});
