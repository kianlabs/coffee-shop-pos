import { useMemo, useState } from "react";
import { recordPurchase } from "@/data/stock";
import { errorMessage, notify } from "@/lib/notify";
import { t } from "@/services/i18n";
import { planPurchase, purchaseMessage, slugId, unitOptionsFor } from "./stockForm";
import { type StockItem } from "./useStockData";

/**
 * State for "Catat pembelian". An empty `buyId` means a new ingredient,
 * created by `recordPurchase` on save.
 */
export function usePurchaseForm(items: StockItem[], initialId: string, onSaved: () => Promise<void>) {
  const initial = items.find((r) => r.id === initialId) ?? null;
  const [buyId, setBuyId] = useState(initial ? initial.id : "");
  const [buyName, setBuyName] = useState("");
  const [unitPreset, setUnitPresetState] = useState("g");
  const [customUnit, setCustomUnitState] = useState("");
  const [inputUnit, setInputUnit] = useState(initial ? initial.baseUnit : "g");
  const [qty, setQty] = useState(0);
  const [costRp, setCostRp] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => items.find((r) => r.id === buyId) ?? null, [items, buyId]);

  const baseUnit = useMemo(() => {
    if (selected) return selected.baseUnit;
    if (unitPreset === "custom") return customUnit.trim();
    return unitPreset;
  }, [selected, unitPreset, customUnit]);

  const unitOptions = useMemo(() => unitOptionsFor(baseUnit), [baseUnit]);

  function selectIngredient(id: string) {
    setBuyId(id);
    setError(null);
    const ing = items.find((r) => r.id === id);
    if (ing) setInputUnit(ing.baseUnit);
    else setInputUnit(unitPreset === "custom" ? customUnit.trim() : unitPreset);
  }

  function setUnitPreset(value: string) {
    setUnitPresetState(value);
    if (value !== "custom") setInputUnit(value);
  }

  function setCustomUnit(value: string) {
    const next = value.slice(0, 20);
    setCustomUnitState(next);
    setInputUnit(next.trim());
  }

  async function submit(): Promise<boolean> {
    const name = selected ? selected.name : buyName.trim();
    const unit = inputUnit.trim() || baseUnit;
    const plan = planPurchase({ name, baseUnit, inputUnit: unit, qty, costRp });
    if (!plan.ok) {
      setError(plan.error);
      return false;
    }
    setError(null);
    setBusy(true);
    try {
      await recordPurchase({
        ingredientId: selected ? selected.id : slugId(name),
        name,
        baseUnit,
        qty: plan.convertedQty,
        costPerUnitRp: plan.costPerBaseUnit,
      });
      notify.success(purchaseMessage(name, qty, unit, plan.convertedQty, baseUnit));
      await onSaved();
      return true;
    } catch (e) {
      notify.error(errorMessage(e, t("stok.purchase.failed")));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    selected,
    buyId,
    buyName,
    setBuyName: (v: string) => setBuyName(v.slice(0, 60)),
    unitPreset,
    setUnitPreset,
    customUnit,
    setCustomUnit,
    baseUnit,
    inputUnit,
    setInputUnit,
    unitOptions,
    qty,
    setQty,
    costRp,
    setCostRp: (v: number) => setCostRp(Math.max(0, v)),
    error,
    busy,
    selectIngredient,
    submit,
  };
}

export type PurchaseForm = ReturnType<typeof usePurchaseForm>;
