import { useCallback, useEffect, useState } from "react";
import { isNativePlatform } from "@/data/db";
import { loadIngredientOptions } from "@/data/recipeRepo";
import { loadIngredients, type IngredientRow } from "@/data/stock";
import { errorMessage, notify } from "@/lib/notify";

export interface StockItem extends IngredientRow {
  /** Harga beli terakhir per satuan dasar (0 bila belum pernah dibeli). */
  lastCostRp: number;
}

async function fetchStockItems(): Promise<StockItem[]> {
  const [rows, options] = await Promise.all([loadIngredients(), loadIngredientOptions()]);
  const costs = new Map(options.map((o) => [o.id, o.lastCostRp]));
  return rows.map((r) => ({ ...r, lastCostRp: costs.get(r.id) ?? 0 }));
}

export function useStockData() {
  const native = isNativePlatform();
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(native);
  const [loadFailed, setLoadFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setItems(await fetchStockItems());
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
      notify.error(errorMessage(e, "Gagal memuat bahan."));
    }
  }, []);

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    setLoading(true);
    fetchStockItems()
      .then((list) => {
        if (cancelled) return;
        setItems(list);
        setLoadFailed(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadFailed(true);
        notify.error(errorMessage(e, "Gagal memuat bahan."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [native]);

  return { native, items, loading, loadFailed, reload };
}
