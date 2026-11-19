import { ClipboardCheck, PackagePlus } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/domain/money";
import { formatQtyWithUnit } from "@/domain/units";
import { t } from "@/services/i18n";
import { STOCK_GRID_COLS } from "./layout";
import { StockStatus } from "./StockStatus";
import { type StockItem } from "./useStockData";

interface IngredientRowItemProps {
  item: StockItem;
  onPurchase: (id: string) => void;
  onAdjust: (id: string) => void;
}

/** Card on phones and tablets, table-like row from `lg` up. */
export function IngredientRowItem({ item, onPurchase, onAdjust }: IngredientRowItemProps) {
  return (
    <li
      data-testid="stok-row"
      className={cn(
        "grid gap-3 rounded-lg border bg-card p-4 lg:items-center lg:rounded-none lg:border-0 lg:border-b lg:bg-transparent lg:px-4 lg:py-3",
        STOCK_GRID_COLS,
      )}
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{item.name}</p>
        <div className="mt-1">
          <StockStatus stockQty={item.stockQty} />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm lg:contents">
        <div className="min-w-0">
          <dt className="text-muted-foreground lg:sr-only">{t("stok.stock.label")}</dt>
          <dd className={item.stockQty < 0 ? "font-medium text-destructive" : "font-medium"}>
            {formatQtyWithUnit(item.stockQty, item.baseUnit)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground lg:sr-only">{t("stok.lastCost.label")}</dt>
          <dd>
            {formatRupiah(item.lastCostRp)}
            <span className="text-muted-foreground">/{item.baseUnit}</span>
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <Button variant="outline" size="sm" className="flex-1 lg:flex-none" onClick={() => onPurchase(item.id)}>
          <PackagePlus aria-hidden />
          {t("stok.purchase.button")}
        </Button>
        <Button variant="outline" size="sm" className="flex-1 lg:flex-none" onClick={() => onAdjust(item.id)}>
          <ClipboardCheck aria-hidden />
          {t("stok.adjust.button")}
        </Button>
      </div>
    </li>
  );
}
