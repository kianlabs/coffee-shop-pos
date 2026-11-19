import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { unitPriceFor, variantsOf, type CatalogProduct, type ProductVariant } from "@/domain/catalog";
import { formatRupiah } from "@/domain/money";

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
          <DialogDescription>Pilih varian untuk ditambahkan ke pesanan.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2" role="group" aria-label={`Varian ${product?.name ?? ""}`}>
          {product &&
            variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                aria-label={`Tambah ${product.name} ${variant.name}`}
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
