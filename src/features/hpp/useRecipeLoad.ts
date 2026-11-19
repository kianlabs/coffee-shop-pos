import { useEffect, useState } from "react";
import { loadIngredientOptions, loadRecipeForProduct, type IngredientOption } from "@/data/recipeRepo";
import { errorMessage, notify } from "@/lib/notify";

export interface DraftLine {
  /** Local React key; not saved. */
  key: number;
  ingredientId: string;
  qtyPerUnit: number;
}

let lineSeq = 0;
export function makeLine(ingredientId: string, qtyPerUnit: number): DraftLine {
  lineSeq += 1;
  return { key: lineSeq, ingredientId, qtyPerUnit };
}

/**
 * Loads ingredient options and the active recipe. Without a recipe the draft
 * starts with the first ingredient at qty 1.
 */
export function useRecipeLoad(
  productId: string,
  variantId: string | null,
  setLines: (lines: DraftLine[]) => void,
) {
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadIngredientOptions(), loadRecipeForProduct(productId, variantId)])
      .then(([options, recipe]) => {
        if (cancelled) return;
        setIngredients(options);
        setVersion(recipe?.version ?? null);
        if (recipe && recipe.lines.length > 0) {
          setLines(recipe.lines.map((l) => makeLine(l.ingredientId, l.qtyPerUnit)));
        } else if (options.length > 0) {
          setLines([makeLine(options[0].id, 1)]);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) notify.error(errorMessage(e, "Gagal memuat resep."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, variantId, setLines]);

  return { ingredients, version, loading };
}
