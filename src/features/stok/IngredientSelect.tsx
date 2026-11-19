import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t } from "@/services/i18n";
import { NEW_INGREDIENT } from "./stockForm";
import { type StockItem } from "./useStockData";

interface IngredientSelectProps {
  id: string;
  value: string;
  items: StockItem[];
  /** Adds a "bahan baru" option; an empty value then means a new ingredient. */
  allowNew?: boolean;
  onChange: (id: string) => void;
}

export function IngredientSelect({ id, value, items, allowNew = false, onChange }: IngredientSelectProps) {
  const selectValue = allowNew && value === "" ? NEW_INGREDIENT : value;
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{t("stok.ingredient.label")}</Label>
      <Select
        value={selectValue}
        onValueChange={(v) => onChange(v === NEW_INGREDIENT ? "" : v)}
      >
        <SelectTrigger id={id} className="w-full min-w-0">
          <SelectValue placeholder={t("stok.ingredient.placeholder")} />
        </SelectTrigger>
        <SelectContent>
          {allowNew && <SelectItem value={NEW_INGREDIENT}>{t("stok.ingredient.new")}</SelectItem>}
          {items.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name} ({r.baseUnit})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
