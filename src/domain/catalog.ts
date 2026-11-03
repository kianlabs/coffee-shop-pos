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

export const CATEGORIES: Category[] = [
  { id: "cat-coffee", name: "Kopi", sortOrder: 0 },
  { id: "cat-noncoffee", name: "Non-Kopi", sortOrder: 1 },
  { id: "cat-food", name: "Makanan", sortOrder: 2 },
];

export const PRODUCTS: Product[] = [
  { id: "prod-kopi-susu", categoryId: "cat-coffee", name: "Kopi Susu", basePriceRp: 15000, isActive: true },
  { id: "prod-kopi-tubruk", categoryId: "cat-coffee", name: "Kopi Tubruk", basePriceRp: 12000, isActive: true },
  { id: "prod-americano", categoryId: "cat-coffee", name: "Americano", basePriceRp: 14000, isActive: true },
  { id: "prod-matcha", categoryId: "cat-noncoffee", name: "Matcha Latte", basePriceRp: 18000, isActive: true },
  { id: "prod-teh", categoryId: "cat-noncoffee", name: "Es Teh Manis", basePriceRp: 8000, isActive: true },
  { id: "prod-roti", categoryId: "cat-food", name: "Roti Bakar", basePriceRp: 10000, isActive: true },
];

export const VARIANTS: ProductVariant[] = [
  { id: "var-kopi-susu-reg", productId: "prod-kopi-susu", name: "Regular", priceDeltaRp: 0, isActive: true },
  { id: "var-kopi-susu-lg", productId: "prod-kopi-susu", name: "Large", priceDeltaRp: 5000, isActive: true },
  { id: "var-americano-reg", productId: "prod-americano", name: "Regular", priceDeltaRp: 0, isActive: true },
  { id: "var-americano-lg", productId: "prod-americano", name: "Large", priceDeltaRp: 5000, isActive: true },
  { id: "var-matcha-reg", productId: "prod-matcha", name: "Regular", priceDeltaRp: 0, isActive: true },
  { id: "var-matcha-lg", productId: "prod-matcha", name: "Large", priceDeltaRp: 5000, isActive: true },
];

export function variantsForProduct(productId: string): ProductVariant[] {
  return VARIANTS.filter((v) => v.productId === productId && v.isActive);
}

export function unitPriceFor(product: Product, variant: ProductVariant | null): Rupiah {
  return product.basePriceRp + (variant ? variant.priceDeltaRp : 0);
}
