import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCategory,
  createProduct,
  createVariant,
  deactivateProduct,
  deactivateVariant,
  loadCatalog,
  updateProduct,
  updateVariant,
} from "@/data/catalogRepo";
import type { Catalog, CatalogProduct, ProductVariant } from "@/domain/catalog";
import type { Rupiah } from "@/domain/money";
import { errorMessage, notify } from "@/lib/notify";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";

export interface ProductInput {
  name: string;
  categoryId: string;
  basePriceRp: Rupiah;
}

export interface VariantPatch {
  name?: string;
  priceDeltaRp?: Rupiah;
}

/** Every action resolves to true on success; failures are already toasted. */
export interface CatalogActions {
  addCategory: (name: string) => Promise<boolean>;
  addProduct: (input: ProductInput) => Promise<boolean>;
  saveProduct: (id: string, input: ProductInput) => Promise<boolean>;
  removeProduct: (product: CatalogProduct) => Promise<boolean>;
  addVariant: (productId: string, name: string, priceDeltaRp: Rupiah) => Promise<boolean>;
  saveVariant: (id: string, patch: VariantPatch) => Promise<boolean>;
  removeVariant: (variant: ProductVariant) => Promise<boolean>;
}

type LoadStatus = "loading" | "ready" | "error";

const EMPTY_CATALOG: Catalog = { categories: [], products: [] };

export function useCatalogEditor() {
  const bumpCatalog = useAppStore((s) => s.bumpCatalog);
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadCatalog().then(
      (next) => {
        if (cancelled) return;
        setCatalog(next);
        setStatus("ready");
      },
      (e: unknown) => {
        if (cancelled) return;
        notify.error(errorMessage(e, t("menu.error.load")));
        setStatus("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  /** Reloads without showing the skeleton, so open dialogs stay mounted. */
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      setCatalog(await loadCatalog());
      return true;
    } catch (e) {
      notify.error(errorMessage(e, t("menu.error.load")));
      return false;
    }
  }, []);

  const retry = useCallback(async () => {
    setStatus("loading");
    const ok = await refresh();
    setStatus(ok ? "ready" : "error");
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<void>, success: string): Promise<boolean> => {
      setPending((n) => n + 1);
      try {
        await action();
        await refresh();
        bumpCatalog();
        notify.success(success);
        return true;
      } catch (e) {
        notify.error(errorMessage(e, t("menu.error.save")));
        return false;
      } finally {
        setPending((n) => n - 1);
      }
    },
    [refresh, bumpCatalog],
  );

  const actions = useMemo<CatalogActions>(
    () => ({
      addCategory: (name) => run(() => createCategory(name), t("menu.toast.categoryAdded")),
      addProduct: (input) =>
        run(
          () => createProduct(input),
          t("menu.toast.productAdded", { nama: input.name.trim() }),
        ),
      saveProduct: (id, input) =>
        run(() => updateProduct(id, input), t("menu.toast.productUpdated")),
      removeProduct: (product) =>
        run(
          () => deactivateProduct(product.id),
          t("menu.toast.productDeleted", { nama: product.name }),
        ),
      addVariant: (productId, name, priceDeltaRp) =>
        run(
          () => createVariant(productId, name, Math.trunc(priceDeltaRp)),
          t("menu.toast.variantAdded"),
        ),
      saveVariant: (id, patch) =>
        run(() => updateVariant(id, patch), t("menu.toast.variantUpdated")),
      removeVariant: (variant) =>
        run(() => deactivateVariant(variant.id), t("menu.toast.variantDeleted")),
    }),
    [run],
  );

  return { catalog, status, busy: pending > 0, retry, actions };
}
