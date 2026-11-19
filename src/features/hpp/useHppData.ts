import { useCallback, useEffect, useState } from "react";
import { isNativePlatform } from "@/data/db";
import { loadHppProducts, saveHppDrafts, type HppProductView } from "@/data/productRepo";
import { type VariantHppMode } from "@/domain/hppResolve";
import { errorMessage, notify } from "@/lib/notify";
import { t } from "@/services/i18n";
import { buildDraft, lineLabel, type HppLine } from "./hppModel";

export function useHppData() {
  const native = isNativePlatform();
  const [rows, setRows] = useState<HppProductView[]>([]);
  const [loading, setLoading] = useState(native);
  const [loadFailed, setLoadFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setRows(await loadHppProducts());
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
      notify.error(errorMessage(e, t("hpp.loadFailed.message")));
    }
  }, []);

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    setLoading(true);
    loadHppProducts()
      .then((list) => {
        if (cancelled) return;
        setRows(list);
        setLoadFailed(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadFailed(true);
        notify.error(errorMessage(e, t("hpp.loadFailed.message")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [native]);

  /** Saves one row's HPP setting. Returns false on failure so the dialog stays open. */
  const saveLine = useCallback(
    async (line: HppLine, mode: VariantHppMode, manualRp: number): Promise<boolean> => {
      const draft = buildDraft(line, mode, manualRp);
      if (!draft) return true;
      try {
        await saveHppDrafts([draft]);
        notify.success(t("hpp.saved", { nama: lineLabel(line) }));
        await reload();
        return true;
      } catch (e) {
        notify.error(errorMessage(e, t("hpp.saveFailed")));
        return false;
      }
    },
    [reload],
  );

  return { native, rows, loading, loadFailed, reload, saveLine };
}
