import type { Catalog, CatalogProduct, Category, ProductVariant } from "../domain/catalog";
import { DEFAULT_CATEGORIES, EMPTY_CATALOG } from "../domain/catalog";
import type { Rupiah } from "../domain/money";

/**
 * Penyimpanan katalog untuk mode browser (tanpa SQLite). Bentuk datanya sama
 * dengan tabel products/product_variants supaya layar tidak perlu tahu
 * backend mana yang aktif.
 */
const KEY = "pos.catalog.v1";

function read(): Catalog {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY_CATALOG);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return structuredClone(EMPTY_CATALOG);
    const c = parsed as Partial<Catalog>;
    const categories = Array.isArray(c.categories) && c.categories.length > 0 ? c.categories : DEFAULT_CATEGORIES;
    const products = Array.isArray(c.products) ? c.products : [];
    return { categories, products };
  } catch {
    return structuredClone(EMPTY_CATALOG);
  }
}

function write(next: Catalog): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Kuota penuh: katalog tetap hidup di memori lewat state UI.
  }
}

function uid(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export function loadCatalogLocal(): Catalog {
  const data = read();
  return {
    categories: [...data.categories].sort((a, b) => a.sortOrder - b.sortOrder),
    products: data.products.filter((p) => p.isActive),
  };
}

export function createCategoryLocal(name: string): Category {
  const data = read();
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new Error("Nama kategori wajib diisi.");
  if (data.categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error("Kategori itu sudah ada.");
  }
  const category: Category = {
    id: uid("cat"),
    name: clean,
    sortOrder: data.categories.length,
  };
  write({ ...data, categories: [...data.categories, category] });
  return category;
}

export function createProductLocal(input: {
  name: string;
  categoryId: string;
  basePriceRp: Rupiah;
}): CatalogProduct {
  const data = read();
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error("Nama menu wajib diisi.");
  if (!Number.isInteger(input.basePriceRp) || input.basePriceRp < 0) {
    throw new Error("Harga harus bilangan bulat Rupiah.");
  }
  const product: CatalogProduct = {
    id: uid("prod"),
    categoryId: input.categoryId,
    name,
    basePriceRp: input.basePriceRp,
    isActive: true,
    variants: [],
  };
  write({ ...data, products: [...data.products, product] });
  return product;
}

export function updateProductLocal(
  id: string,
  patch: { name?: string; basePriceRp?: Rupiah; categoryId?: string },
): void {
  const data = read();
  const products = data.products.map((p) => {
    if (p.id !== id) return p;
    const name = patch.name !== undefined ? patch.name.trim().slice(0, 80) : p.name;
    if (!name) throw new Error("Nama menu wajib diisi.");
    const price = patch.basePriceRp !== undefined ? patch.basePriceRp : p.basePriceRp;
    if (!Number.isInteger(price) || price < 0) throw new Error("Harga harus bilangan bulat Rupiah.");
    return { ...p, name, basePriceRp: price, categoryId: patch.categoryId ?? p.categoryId };
  });
  write({ ...data, products });
}

export function deactivateProductLocal(id: string): void {
  const data = read();
  write({ ...data, products: data.products.filter((p) => p.id !== id) });
}

export function createVariantLocal(productId: string, name: string, priceDeltaRp: Rupiah): ProductVariant {
  const data = read();
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error("Nama varian wajib diisi.");
  const variant: ProductVariant = {
    id: uid("var"),
    productId,
    name: clean,
    priceDeltaRp: Math.trunc(priceDeltaRp),
    isActive: true,
  };
  write({
    ...data,
    products: data.products.map((p) => (p.id === productId ? { ...p, variants: [...p.variants, variant] } : p)),
  });
  return variant;
}

export function updateVariantLocal(id: string, patch: { name?: string; priceDeltaRp?: Rupiah }): void {
  const data = read();
  write({
    ...data,
    products: data.products.map((p) => ({
      ...p,
      variants: p.variants.map((v) =>
        v.id === id
          ? {
              ...v,
              name: patch.name !== undefined ? patch.name.trim().slice(0, 40) || v.name : v.name,
              priceDeltaRp: patch.priceDeltaRp !== undefined ? Math.trunc(patch.priceDeltaRp) : v.priceDeltaRp,
            }
          : v,
      ),
    })),
  });
}

export function deactivateVariantLocal(id: string): void {
  const data = read();
  write({
    ...data,
    products: data.products.map((p) => ({ ...p, variants: p.variants.filter((v) => v.id !== id) })),
  });
}
