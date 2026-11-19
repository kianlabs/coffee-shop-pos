import { useMemo, useState } from "react";
import type { Catalog, CatalogProduct } from "@/domain/catalog";
import { CategoryDialog } from "./CategoryDialog";
import {
  ALL_CATEGORIES,
  pickDefaultCategory,
  productCountByCategory,
  visibleProducts,
} from "./catalogView";
import { MenuHeader } from "./MenuHeader";
import { MenuResults } from "./MenuResults";
import { MenuToolbar } from "./MenuToolbar";
import { ProductFormDialog } from "./ProductFormDialog";
import type { CatalogActions } from "./useCatalogEditor";

/**
 * The target outlives `formOpen` so the dialog keeps its content during the
 * close animation; edit keeps a snapshot for when the product was just deleted.
 */
type FormTarget = { mode: "create" } | { mode: "edit"; snapshot: CatalogProduct };

interface MenuEditorProps {
  catalog: Catalog;
  busy: boolean;
  actions: CatalogActions;
}

export function MenuEditor({ catalog, busy, actions }: MenuEditorProps) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [target, setTarget] = useState<FormTarget>({ mode: "create" });
  const [formOpen, setFormOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [lastCategoryId, setLastCategoryId] = useState("");

  const rows = useMemo(
    () => visibleProducts(catalog, query, categoryFilter),
    [catalog, query, categoryFilter],
  );
  const counts = useMemo(() => productCountByCategory(catalog), [catalog]);

  const live =
    target.mode === "edit"
      ? catalog.products.find((p) => p.id === target.snapshot.id)
      : undefined;
  // A deleted product closes its dialog because it leaves the catalog.
  const dialogOpen = formOpen && (target.mode === "create" || live !== undefined);
  const shownProduct = target.mode === "edit" ? (live ?? target.snapshot) : null;

  function openCreate() {
    setTarget({ mode: "create" });
    setFormOpen(true);
  }

  function openProduct(productId: string) {
    const product = catalog.products.find((p) => p.id === productId);
    if (!product) return;
    setTarget({ mode: "edit", snapshot: product });
    setFormOpen(true);
  }

  function handleSaved(categoryId: string) {
    if (target.mode === "create") setLastCategoryId(categoryId);
    setFormOpen(false);
  }

  return (
    <div className="grid gap-4" data-testid="menu-screen">
      <MenuHeader productCount={catalog.products.length} />
      <MenuToolbar
        categories={catalog.categories}
        query={query}
        onQueryChange={setQuery}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        onAddProduct={openCreate}
        onManageCategories={() => setCategoriesOpen(true)}
      />
      <MenuResults
        totalProducts={catalog.products.length}
        rows={rows}
        onOpen={openProduct}
        onAddFirst={openCreate}
        onClearFilters={() => {
          setQuery("");
          setCategoryFilter(ALL_CATEGORIES);
        }}
      />
      <ProductFormDialog
        open={dialogOpen}
        onOpenChange={setFormOpen}
        product={shownProduct}
        categories={catalog.categories}
        defaultCategoryId={pickDefaultCategory(catalog.categories, categoryFilter, lastCategoryId)}
        busy={busy}
        actions={actions}
        onSaved={handleSaved}
      />
      <CategoryDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        categories={catalog.categories}
        productCounts={counts}
        onAdd={actions.addCategory}
      />
    </div>
  );
}
