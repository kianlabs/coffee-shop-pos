import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CatalogProduct, Category } from "@/domain/catalog";
import { t } from "@/services/i18n";
import { ProductForm } from "./ProductForm";
import type { CatalogActions } from "./useCatalogEditor";

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create a new product. */
  product: CatalogProduct | null;
  categories: Category[];
  defaultCategoryId: string;
  busy: boolean;
  actions: CatalogActions;
  onSaved: (categoryId: string) => void;
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  categories,
  defaultCategoryId,
  busy,
  actions,
  onSaved,
}: ProductFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        data-testid="product-form-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {product ? t("menu.product.dialogTitleEdit") : t("menu.product.add")}
          </DialogTitle>
          <DialogDescription>{t("menu.product.dialogDescription")}</DialogDescription>
        </DialogHeader>
        {/* Keyed so the draft resets when a different product is opened. */}
        <ProductForm
          key={product?.id ?? "new"}
          product={product}
          categories={categories}
          defaultCategoryId={defaultCategoryId}
          busy={busy}
          actions={actions}
          onSaved={onSaved}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
