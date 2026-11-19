import { ChevronRight, CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/domain/money";
import type { ProductRowData } from "./catalogView";

interface ProductRowProps {
  row: ProductRowData;
  onOpen: (productId: string) => void;
}

export function ProductRow({ row, onOpen }: ProductRowProps) {
  const { product, categoryName } = row;
  const variantCount = product.variants.length;
  return (
    <button
      type="button"
      data-testid="menu-product-row"
      aria-label={`Edit ${product.name}`}
      onClick={() => onOpen(product.id)}
      className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{product.name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {categoryName ?? "Tanpa kategori"}
          {variantCount > 0 && ` · ${variantCount} varian`}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-medium tabular-nums">{formatRupiah(product.basePriceRp)}</span>
        <Badge variant="secondary" className="text-success">
          <CircleCheck aria-hidden />
          Aktif
        </Badge>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}
