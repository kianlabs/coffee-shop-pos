import { useDeferredValue, useMemo } from "react";
import { variantsOf, type Catalog, type CatalogProduct, type ProductVariant } from "@/domain/catalog";
import { useCartStore } from "@/stores/cartStore";

interface VisibleProducts {
  products: CatalogProduct[];
  variantsById: Map<string, ProductVariant[]>;
  qtyById: Map<string, number>;
}

/** Search spans all categories; without a query only the chosen category shows. */
export function useVisibleProducts(
  catalog: Catalog,
  categoryId: string,
  search: string,
): VisibleProducts {
  const query = useDeferredValue(search).trim().toLowerCase();
  const lines = useCartStore((s) => s.lines);

  const products = useMemo(() => {
    const active = catalog.products.filter((p) => p.isActive);
    if (!query) return active.filter((p) => p.categoryId === categoryId);
    return active.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.variants.some((v) => v.isActive && v.name.toLowerCase().includes(query)),
    );
  }, [catalog.products, categoryId, query]);

  const variantsById = useMemo(() => {
    const map = new Map<string, ProductVariant[]>();
    for (const p of catalog.products) map.set(p.id, variantsOf(p));
    return map;
  }, [catalog.products]);

  const qtyById = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lines) map.set(l.productId, (map.get(l.productId) ?? 0) + l.qty);
    return map;
  }, [lines]);

  return { products, variantsById, qtyById };
}
