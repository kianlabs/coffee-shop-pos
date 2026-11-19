import { memo } from "react";
import { Layers } from "lucide-react";
import { cn } from "cn";
import { type CatalogProduct, type ProductVariant } from "@/domain/catalog";
import { formatRupiah } from "@/domain/money";
import { t } from "@/services/i18n";

interface ProductTileProps {
  product: CatalogProduct;
  variants: ProductVariant[];
  cartQuantity: number;
  onAdd: (product: CatalogProduct) => void;
  onPickVariant: (product: CatalogProduct) => void;
}

/**
 * Fixed-height tile. A product without variants is added with one tap;
 * a product with variants opens the variant picker.
 */
export const ProductTile = memo(function ProductTile({
  product,
  variants,
  cartQuantity,
  onAdd,
  onPickVariant,
}: ProductTileProps) {
  const hasVariants = variants.length > 0;
  const minPrice = hasVariants
    ? Math.min(...variants.map((v) => product.basePriceRp + v.priceDeltaRp))
    : product.basePriceRp;

  return (
    <button
      type="button"
      data-testid="product-tile"
      aria-label={
        hasVariants
          ? t("kasir.product.pickVariant", { name: product.name })
          : t("kasir.product.add", { name: product.name })
      }
      onClick={() => (hasVariants ? onPickVariant(product) : onAdd(product))}
      className={cn(
        "group relative flex h-32 flex-col justify-between rounded-lg border bg-card p-3 text-left transition-colors",
        "outline-none hover:border-foreground/30 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-accent",
        cartQuantity > 0 && "border-primary ring-1 ring-primary",
      )}
    >
      <span className="line-clamp-2 pr-8 text-[15px] leading-snug font-medium">{product.name}</span>
      {cartQuantity > 0 && (
        <span
          className="absolute top-2.5 right-2.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums"
          aria-label={t("kasir.product.inCart", { count: cartQuantity })}
        >
          {cartQuantity}
        </span>
      )}
      <span className="flex flex-col-reverse items-start gap-0.5">
        <span className="text-base font-semibold tabular-nums">
          {hasVariants && (
            <span className="mr-1 text-xs font-normal text-muted-foreground">{t("kasir.product.from")}</span>
          )}
          {formatRupiah(minPrice)}
        </span>
        {hasVariants && (
          <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
            <Layers className="size-3.5" aria-hidden />
            {t("kasir.product.variantCount", { count: variants.length })}
          </span>
        )}
      </span>
    </button>
  );
});
