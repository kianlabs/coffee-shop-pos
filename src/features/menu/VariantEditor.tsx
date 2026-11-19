import type { CatalogProduct } from "@/domain/catalog";
import { t } from "@/services/i18n";
import { NewVariantForm } from "./NewVariantForm";
import type { CatalogActions } from "./useCatalogEditor";
import { VariantRow } from "./VariantRow";

interface VariantEditorProps {
  product: CatalogProduct;
  /** Base price from the form draft, so totals follow unsaved edits. */
  basePrice: number;
  busy: boolean;
  actions: CatalogActions;
}

export function VariantEditor({ product, basePrice, busy, actions }: VariantEditorProps) {
  return (
    <section className="grid gap-3" aria-labelledby="variant-heading">
      <div>
        <h3 id="variant-heading" className="text-base font-semibold">
          {t("menu.variant.heading")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("menu.variant.description")}</p>
      </div>
      {product.variants.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("menu.variant.empty")}</p>
      ) : (
        <ul className="grid gap-2" aria-label={t("menu.variant.listAria", { nama: product.name })}>
          {product.variants.map((v) => (
            <VariantRow
              key={v.id}
              variant={v}
              productName={product.name}
              basePrice={basePrice}
              busy={busy}
              onSave={actions.saveVariant}
              onRemove={actions.removeVariant}
            />
          ))}
        </ul>
      )}
      <NewVariantForm productId={product.id} onAdd={actions.addVariant} />
    </section>
  );
}
