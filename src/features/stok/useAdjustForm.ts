import { useMemo, useState } from "react";
import { adjustStock } from "@/data/stock";
import { errorMessage, notify } from "@/lib/notify";
import { adjustMessage, planAdjust, unitOptionsFor } from "./stockForm";
import { type StockItem } from "./useStockData";

export function useAdjustForm(items: StockItem[], initialId: string, onSaved: () => Promise<void>) {
  const initial = items.find((r) => r.id === initialId) ?? null;
  const [adjId, setAdjId] = useState(initial ? initial.id : "");
  const [inputUnit, setInputUnit] = useState(initial ? initial.baseUnit : "");
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => items.find((r) => r.id === adjId) ?? null, [items, adjId]);
  const unitOptions = useMemo(() => (selected ? unitOptionsFor(selected.baseUnit) : []), [selected]);

  function selectIngredient(id: string) {
    setAdjId(id);
    setError(null);
    setInputUnit(items.find((r) => r.id === id)?.baseUnit ?? "");
  }

  async function submit(): Promise<boolean> {
    const baseUnit = selected ? selected.baseUnit : "";
    const unit = inputUnit.trim() || baseUnit;
    const plan = planAdjust({
      ingredientName: adjId && selected ? selected.name : null,
      baseUnit,
      inputUnit: unit,
      delta,
      reason: reason.trim(),
    });
    if (!plan.ok || !selected) {
      setError(plan.ok ? "Pilih bahan yang mau dikoreksi." : plan.error);
      return false;
    }
    setError(null);
    setBusy(true);
    try {
      await adjustStock({ ingredientId: selected.id, deltaQty: plan.convertedDelta, reason: reason.trim() });
      notify.success(adjustMessage(selected.name, delta, unit, plan.convertedDelta, baseUnit));
      await onSaved();
      return true;
    } catch (e) {
      notify.error(errorMessage(e, "Gagal mengoreksi stok."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    selected,
    adjId,
    inputUnit,
    setInputUnit,
    unitOptions,
    delta,
    setDelta,
    reason,
    setReason: (v: string) => setReason(v.slice(0, 200)),
    error,
    busy,
    selectIngredient,
    submit,
  };
}
