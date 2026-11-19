import { unitPriceFor, type Catalog } from "@/domain/catalog";
import { t } from "@/services/i18n";
import { type CartLine } from "@/stores/cartTypes";

/**
 * Returns a message when a cart line no longer matches the catalog
 * (product or variant deactivated, or price changed), otherwise null.
 */
export function staleCartLineMessage(lines: CartLine[], catalog: Catalog): string | null {
  for (const item of lines) {
    const product = catalog.products.find((p) => p.id === item.productId);
    if (!product || product.isActive === false) {
      return t("kasir.stale.menuInactive", { name: item.productName });
    }
    const variant = item.variantId
      ? (product.variants ?? []).find((v) => v.id === item.variantId)
      : null;
    if (item.variantId && (!variant || variant.isActive === false)) {
      return t("kasir.stale.variantInactive", {
        variant: item.variantName || t("kasir.stale.variantFallback"),
        name: item.productName,
      });
    }
    if (item.unitPriceRp !== unitPriceFor(product, variant ?? null)) {
      return t("kasir.stale.priceChanged", { name: item.productName });
    }
  }
  return null;
}

/** Exact amount first, then the next round notes customers usually hand over. */
export function quickCashOptions(total: number): number[] {
  if (total <= 0) return [];
  const values = new Set<number>([total]);
  for (const step of [5_000, 10_000, 20_000, 50_000, 100_000]) {
    const rounded = Math.ceil(total / step) * step;
    if (rounded > total) values.add(rounded);
  }
  return [...values].slice(0, 4);
}

const MAX_DIGITS = 10;
const MAX_AMOUNT = 999_999_999_999;

/** Applies one numpad key ("0"–"9", "000", or "⌫") to the tendered amount. */
export function applyNumpadKey(current: number, key: string): number {
  let str = current > 0 ? String(current) : "";
  if (key === "⌫") {
    str = str.slice(0, -1);
  } else if (key === "000") {
    if (str !== "") str += "000";
  } else {
    str += key;
  }
  str = str.slice(0, MAX_DIGITS);
  return Math.min(MAX_AMOUNT, parseInt(str || "0", 10));
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}
