import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/services/i18n";
import { FormAlert } from "./FormAlert";
import { RecipeLineRow } from "./RecipeLineRow";
import { RecipeSummary } from "./RecipeSummary";
import { type RecipeEditorState } from "./useRecipeEditor";

interface RecipeLinesProps {
  editor: RecipeEditorState;
  basePriceRp: number;
}

export function RecipeLines({ editor, basePriceRp }: RecipeLinesProps) {
  const { lines, ingredients, byId, busy } = editor;
  return (
    <div className="grid gap-3">
      <ul className="grid gap-2" aria-label={t("hpp.recipe.list.ariaLabel")}>
        {lines.map((line, index) => (
          <RecipeLineRow
            key={line.key}
            line={line}
            index={index}
            ingredients={ingredients}
            ingredient={byId.get(line.ingredientId)}
            disabled={busy}
            canRemove={lines.length > 1}
            onChange={editor.patchLine}
            onRemove={editor.removeLine}
          />
        ))}
      </ul>
      <Button variant="outline" size="sm" className="w-fit" disabled={busy} onClick={editor.addLine}>
        <Plus aria-hidden />
        {t("hpp.recipe.addLine")}
      </Button>
      <RecipeSummary basePriceRp={basePriceRp} totalPerUnit={editor.totalPerUnit} margin={editor.margin} />
      <FormAlert message={lines.length > 0 ? editor.validationError : null} />
      <FormAlert message={editor.error} />
    </div>
  );
}
