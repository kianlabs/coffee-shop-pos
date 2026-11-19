import { Boxes, Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";
import { RecipeLines } from "./RecipeLines";
import { recipeLabel, type RecipeTarget } from "./recipeTarget";
import { useRecipeEditor } from "./useRecipeEditor";

interface RecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: RecipeTarget;
  onSaved: () => Promise<void>;
}

/**
 * Takaran diisi per 1 unit jual dalam satuan dasar bahan. Biaya memakai harga
 * beli terakhir, sama dengan resolver HPP saat checkout. Setiap simpan membuat
 * versi resep baru (lihat `saveRecipe`).
 */
export function RecipeDialog({ open, onOpenChange, target, onSaved }: RecipeDialogProps) {
  const editor = useRecipeEditor(target, onSaved);
  const setView = useAppStore((s) => s.setView);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const title = target.variantName
    ? t("hpp.recipe.titleVariant", { nama: target.productName, varian: target.variantName })
    : t("hpp.recipe.title", { nama: target.productName });
  const close = () => onOpenChange(false);

  const run = async (action: () => Promise<boolean>) => {
    if (await action()) close();
  };

  const empty = !editor.loading && editor.ingredients.length === 0;
  return (
    <Dialog open={open} onOpenChange={(next) => !editor.busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-testid="recipe-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {editor.version
              ? t("hpp.recipe.versionActive", { versi: editor.version })
              : t("hpp.recipe.none")} · {t("hpp.recipe.perUnit")}
          </DialogDescription>
        </DialogHeader>
        {editor.loading && <Skeleton className="h-32 w-full" aria-label={t("hpp.recipe.loading")} />}
        {empty && (
          <EmptyState
            icon={Boxes}
            title={t("hpp.recipe.noIngredient.title")}
            description={t("hpp.recipe.noIngredient.description")}
            action={<Button onClick={() => setView("stok")}>{t("hpp.recipe.openStock")}</Button>}
          />
        )}
        {!editor.loading && !empty && <RecipeLines editor={editor} basePriceRp={target.basePriceRp} />}
        {!editor.loading && !empty && (
          <DialogFooter className="gap-2">
            {editor.version !== null && (
              <Button variant="outline" className="text-destructive sm:mr-auto" disabled={editor.busy} onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden />
                {t("hpp.recipe.delete")}
              </Button>
            )}
            <Button loading={editor.busy} disabled={!editor.canSave} onClick={() => void run(editor.save)} data-testid="recipe-save">
              <Check aria-hidden />
              {t("hpp.recipe.save")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("hpp.recipe.deleteConfirm.title")}
        description={t("hpp.recipe.deleteConfirm.description", { nama: recipeLabel(target) })}
        confirmLabel={t("hpp.recipe.delete")}
        destructive
        onConfirm={() => void run(editor.remove)}
      />
    </Dialog>
  );
}
