import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type IngredientOption } from "@/data/recipeRepo";
import { formatRupiah } from "@/domain/money";
import { lineCostRp, type DraftLine } from "./useRecipeEditor";

interface RecipeLineRowProps {
  line: DraftLine;
  index: number;
  ingredients: IngredientOption[];
  ingredient: IngredientOption | undefined;
  disabled: boolean;
  canRemove: boolean;
  onChange: (key: number, patch: Partial<Omit<DraftLine, "key">>) => void;
  onRemove: (key: number) => void;
}

export function RecipeLineRow(props: RecipeLineRowProps) {
  const { line, index, ingredients, ingredient: ing, disabled, canRemove, onChange, onRemove } = props;
  const n = index + 1;
  return (
    <li data-testid="recipe-line" className="grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
      <div className="grid min-w-0 gap-2">
        <Label htmlFor={`recipe-ing-${line.key}`}>Bahan {n}</Label>
        <Select value={line.ingredientId} disabled={disabled} onValueChange={(v) => onChange(line.key, { ingredientId: v })}>
          <SelectTrigger id={`recipe-ing-${line.key}`} className="w-full min-w-0">
            <SelectValue placeholder="Pilih bahan" />
          </SelectTrigger>
          <SelectContent>
            {ingredients.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name} ({o.baseUnit})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor={`recipe-qty-${line.key}`}>Takaran {ing ? `(${ing.baseUnit})` : ""}</Label>
        <Input
          id={`recipe-qty-${line.key}`}
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={line.qtyPerUnit || ""}
          disabled={disabled}
          onChange={(e) => onChange(line.key, { qtyPerUnit: Math.max(0, Number(e.target.value) || 0) })}
        />
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <p className="text-sm sm:text-right">
          <span className="sr-only">Biaya baris {n}: </span>
          <strong>{formatRupiah(lineCostRp(line, ing))}</strong>
          {ing && (
            <span className="block text-xs text-muted-foreground">
              @ {formatRupiah(ing.lastCostRp)}/{ing.baseUnit}
            </span>
          )}
        </p>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Hapus bahan baris ${n}`}
          disabled={disabled || !canRemove}
          onClick={() => onRemove(line.key)}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
    </li>
  );
}
