import { type HppProductView } from "@/data/productRepo";
import { type VariantHppMode } from "@/domain/hppResolve";
import { HppEditDialog } from "./HppEditDialog";
import { type HppLine } from "./hppModel";
import { RecipeDialog } from "./RecipeDialog";
import { type RecipeTarget } from "./recipeTarget";

/** `seq` remounts the dialog so every opening starts from the saved values. */
export type HppDialogState =
  | { kind: "edit"; line: HppLine; open: boolean; seq: number }
  | { kind: "recipe"; target: RecipeTarget; open: boolean; seq: number };

interface HppDialogsProps {
  dialog: HppDialogState | null;
  rows: HppProductView[];
  onOpenChange: (open: boolean) => void;
  onSaveLine: (line: HppLine, mode: VariantHppMode, manualRp: number) => Promise<boolean>;
  onOpenRecipe: (line: HppLine) => void;
  onRecipeSaved: () => Promise<void>;
}

export function HppDialogs({ dialog, rows, onOpenChange, onSaveLine, onOpenRecipe, onRecipeSaved }: HppDialogsProps) {
  if (!dialog) return null;
  if (dialog.kind === "recipe") {
    return (
      <RecipeDialog
        key={dialog.seq}
        open={dialog.open}
        onOpenChange={onOpenChange}
        target={dialog.target}
        onSaved={onRecipeSaved}
      />
    );
  }
  const product = rows.find((p) => p.id === dialog.line.productId);
  if (!product) return null;
  return (
    <HppEditDialog
      key={dialog.seq}
      open={dialog.open}
      onOpenChange={onOpenChange}
      line={dialog.line}
      product={product}
      onSave={onSaveLine}
      onOpenRecipe={onOpenRecipe}
    />
  );
}
