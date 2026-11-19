import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { unitPriceFor, variantsOf, type CatalogProduct, type ProductVariant } from "@/domain/catalog";
import { formatRupiah } from "@/domain/money";
import { t } from "@/services/i18n";

interface VariantPickerDialogProps {
  product: CatalogProduct | null;
  onClose: () => void;
  onPick: (product: CatalogProduct, variant: ProductVariant) => void;
}

export function VariantPickerDialog({ product, onClose, onPick }: VariantPickerDialogProps) {
  const variants = product ? variantsOf(product) : [];
  return (
    <Dialog open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product?.name}</DialogTitle>
          <DialogDescription>{t("kasir.variant.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2" role="group" aria-label={t("kasir.variant.group", { name: product?.name ?? "" })}>
          {product &&
            variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                aria-label={t("kasir.variant.add", { product: product.name, variant: variant.name })}
                onClick={() => onPick(product, variant)}
                className="flex min-h-14 items-center justify-between rounded-lg border px-4 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="font-medium">{variant.name}</span>
                <span className="font-semibold tabular-nums">
                  {formatRupiah(unitPriceFor(product, variant))}
                </span>
              </button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
