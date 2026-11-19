import type { Catalog, CatalogProduct } from "@/domain/catalog";

export const ALL_CATEGORIES = "all";

export interface ProductRowData {
  product: CatalogProduct;
  /** null when the product points at a category that no longer exists. */
  categoryName: string | null;
}

function matchesQuery(product: CatalogProduct, q: string): boolean {
  if (!q) return true;
  if (product.name.toLowerCase().includes(q)) return true;
  return product.variants.some((v) => v.name.toLowerCase().includes(q));
}

/**
 * Products ordered by category order, then by the repository's name order.
 * Search matches product or variant names, as the old editor did.
 */
export function visibleProducts(
  catalog: Catalog,
  query: string,
  categoryFilter: string,
): ProductRowData[] {
  const q = query.trim().toLowerCase();
  const rank = new Map(catalog.categories.map((c, i) => [c.id, i]));
  const names = new Map(catalog.categories.map((c) => [c.id, c.name]));
  return catalog.products
    .filter((p) => categoryFilter === ALL_CATEGORIES || p.categoryId === categoryFilter)
    .filter((p) => matchesQuery(p, q))
    .map((product) => ({ product, categoryName: names.get(product.categoryId) ?? null }))
    .sort(
      (a, b) =>
        (rank.get(a.product.categoryId) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.product.categoryId) ?? Number.MAX_SAFE_INTEGER),
    );
}

export function productCountByCategory(catalog: Catalog): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of catalog.products) {
    counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
  }
  return counts;
}

/** Category for a new product: the active filter, then the last one used, then the first. */
export function pickDefaultCategory(
  categories: Catalog["categories"],
  categoryFilter: string,
  lastUsedId: string,
): string {
  const ids = new Set(categories.map((c) => c.id));
  if (categoryFilter !== ALL_CATEGORIES && ids.has(categoryFilter)) return categoryFilter;
  if (ids.has(lastUsedId)) return lastUsedId;
  return categories[0]?.id ?? "";
}
