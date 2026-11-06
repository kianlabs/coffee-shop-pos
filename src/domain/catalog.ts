import type { Rupiah } from "./money";

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
};

export type Product = {
  id: string;
  categoryId: string;
  name: string;
  basePriceRp: Rupiah;
  isActive: boolean;
};

export type ProductVariant = {
  id: string;
  productId: string;
  name: string;
  priceDeltaRp: Rupiah;
  isActive: boolean;
};

/** Produk + varian aktifnya, dipakai layar kasir dan layar Menu. */
export type CatalogProduct = Product & { variants: ProductVariant[] };

export type Catalog = {
  categories: Category[];
  products: CatalogProduct[];
};

/**
 * Kategori awal hanya supaya user tidak mulai dari layar benar-benar kosong.
 * Produk SENGAJA tidak di-seed: menu dan harga diisi sendiri oleh pemilik warung.
 */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat-kopi", name: "Kopi", sortOrder: 0 },
  { id: "cat-nonkopi", name: "Non-Kopi", sortOrder: 1 },
  { id: "cat-makanan", name: "Makanan", sortOrder: 2 },
];

export const EMPTY_CATALOG: Catalog = { categories: DEFAULT_CATEGORIES, products: [] };

export function unitPriceFor(product: Product, variant: ProductVariant | null): Rupiah {
  return product.basePriceRp + (variant ? variant.priceDeltaRp : 0);
}

export function variantsOf(product: CatalogProduct): ProductVariant[] {
  return Array.isArray(product.variants) ? product.variants.filter((v) => v.isActive) : [];
}
