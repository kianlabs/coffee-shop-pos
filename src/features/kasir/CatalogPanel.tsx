import { useCallback, useState } from "react";
import { BookOpen, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { type CatalogProduct, type ProductVariant } from "@/domain/catalog";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";
import { useCartStore } from "@/stores/cartStore";
import { CatalogToolbar } from "./CatalogToolbar";
import { ProductTile } from "./ProductTile";
import { VariantPickerDialog } from "./VariantPickerDialog";
import { useVisibleProducts } from "./useVisibleProducts";

export function CatalogPanel() {
  const catalog = useAppStore((s) => s.catalog);
  const setView = useAppStore((s) => s.setView);
  const add = useCartStore((s) => s.add);
  const [search, setSearch] = useState("");
  const [chosenCategory, setChosenCategory] = useState("");
  const [picking, setPicking] = useState<CatalogProduct | null>(null);

  const categoryId = catalog.categories.some((c) => c.id === chosenCategory)
    ? chosenCategory
    : (catalog.categories[0]?.id ?? "");
  const { products, variantsById, qtyById } = useVisibleProducts(catalog, categoryId, search);

  const addPlain = useCallback((product: CatalogProduct) => add(product, null), [add]);
  const addVariant = useCallback(
    (product: CatalogProduct, variant: ProductVariant) => {
      add(product, variant);
      setPicking(null);
    },
    [add],
  );

  return (
    <section aria-label={t("kasir.catalog.region")} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <CatalogToolbar
        search={search}
        onSearch={setSearch}
        categories={catalog.categories}
        categoryId={categoryId}
        onCategory={setChosenCategory}
        resultCount={products.length}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-28 md:px-6 lg:pb-6">
        {catalog.products.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={t("kasir.catalog.emptyTitle")}
            description={t("kasir.catalog.emptyDescription")}
            action={<Button onClick={() => setView("menu")}>{t("kasir.catalog.openMenu")}</Button>}
          />
        ) : products.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={t("kasir.catalog.notFound")}
            description={t("kasir.catalog.notFoundDescription")}
            action={
              <Button variant="outline" onClick={() => setSearch("")}>
                {t("kasir.search.clear")}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {products.map((product) => (
              <ProductTile
                key={product.id}
                product={product}
                variants={variantsById.get(product.id) ?? []}
                cartQuantity={qtyById.get(product.id) ?? 0}
                onAdd={addPlain}
                onPickVariant={setPicking}
              />
            ))}
          </div>
        )}
      </div>
      <VariantPickerDialog product={picking} onClose={() => setPicking(null)} onPick={addVariant} />
    </section>
  );
}
