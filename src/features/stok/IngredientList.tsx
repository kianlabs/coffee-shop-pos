import { cn } from "cn";
import { IngredientRowItem } from "./IngredientRowItem";
import { STOCK_GRID_COLS } from "./layout";
import { type StockItem } from "./useStockData";

interface IngredientListProps {
  items: StockItem[];
  onPurchase: (id: string) => void;
  onAdjust: (id: string) => void;
}

export function IngredientList({ items, onPurchase, onAdjust }: IngredientListProps) {
  return (
    <div className="lg:rounded-lg lg:border lg:bg-card">
      <div
        aria-hidden
        className={cn(
          "hidden border-b px-4 py-2 text-xs font-medium text-muted-foreground lg:grid",
          STOCK_GRID_COLS,
        )}
      >
        <span>Bahan</span>
        <span>Stok</span>
        <span>Harga beli terakhir</span>
        <span className="text-right">Aksi</span>
      </div>
      <ul className="grid gap-3 lg:gap-0 lg:[&>li:last-child]:border-b-0" aria-label="Daftar bahan">
        {items.map((item) => (
          <IngredientRowItem key={item.id} item={item} onPurchase={onPurchase} onAdjust={onAdjust} />
        ))}
      </ul>
    </div>
  );
}
