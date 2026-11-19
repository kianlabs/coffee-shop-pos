import { useMemo, useState } from "react";
import { deleteRecipe, saveRecipe, type IngredientOption } from "@/data/recipeRepo";
import { marginFor } from "@/domain/hppResolve";
import { validateRecipeLines } from "@/domain/recipe";
import { errorMessage, notify } from "@/lib/notify";
import { recipeLabel, type RecipeTarget } from "./recipeTarget";
import { makeLine, useRecipeLoad, type DraftLine } from "./useRecipeLoad";

export type { DraftLine };


/** Biaya baris = takaran × harga beli terakhir, dibulatkan per baris (sama dengan resolver). */
export function lineCostRp(line: DraftLine, ing: IngredientOption | undefined): number {
  return ing && line.qtyPerUnit > 0 ? Math.round(line.qtyPerUnit * ing.lastCostRp) : 0;
}

export function useRecipeEditor(target: RecipeTarget, onSaved: () => Promise<void>) {
  const { productId, variantId } = target;
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { ingredients, version, loading } = useRecipeLoad(productId, variantId, setLines);

  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const totalPerUnit = useMemo(
    () => lines.reduce((sum, line) => sum + lineCostRp(line, byId.get(line.ingredientId)), 0),
    [lines, byId],
  );
  const margin = marginFor(target.basePriceRp, totalPerUnit);
  const validationError = validateRecipeLines(lines);
  const canSave = !busy && lines.length > 0 && validationError === null;

  function patchLine(key: number, patch: Partial<Omit<DraftLine, "key">>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    setError(null);
  }

  function addLine() {
    const used = new Set(lines.map((l) => l.ingredientId));
    const next = ingredients.find((i) => !used.has(i.id));
    if (!next) {
      setError("Semua bahan sudah dipakai di resep ini.");
      return;
    }
    setLines((prev) => [...prev, makeLine(next.id, 1)]);
    setError(null);
  }

  function removeLine(key: number) {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setError(null);
  }

  async function run(action: () => Promise<string>, fallback: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const message = await action();
      await onSaved();
      notify.success(message);
      return true;
    } catch (e) {
      notify.error(errorMessage(e, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      const lineDrafts = lines.map((l) => ({ ingredientId: l.ingredientId, qtyPerUnit: l.qtyPerUnit }));
      const res = await saveRecipe({ productId, variantId, lines: lineDrafts });
      return `Resep ${recipeLabel(target)} disimpan (versi ${res.version}).`;
    }, "Gagal menyimpan resep.");

  const remove = () =>
    run(async () => {
      await deleteRecipe(productId, variantId);
      return `Resep ${recipeLabel(target)} dihapus.`;
    }, "Gagal menghapus resep.");

  return {
    ingredients,
    byId,
    lines,
    version,
    loading,
    busy,
    error,
    validationError,
    canSave,
    totalPerUnit,
    margin,
    patchLine,
    addLine,
    removeLine,
    save,
    remove,
  };
}

export type RecipeEditorState = ReturnType<typeof useRecipeEditor>;
