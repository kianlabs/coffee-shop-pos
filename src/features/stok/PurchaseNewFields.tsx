import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t } from "@/services/i18n";
import { BASE_UNIT_PRESETS } from "./stockForm";
import { type PurchaseForm } from "./usePurchaseForm";

interface PurchaseNewFieldsProps {
  form: PurchaseForm;
}

/** Name and base unit, shown only when the purchase creates a new ingredient. */
export function PurchaseNewFields({ form }: PurchaseNewFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="buy-name">{t("stok.purchase.newName.label")}</Label>
        <Input
          id="buy-name"
          data-testid="stok-buy-name"
          placeholder={t("stok.purchase.newName.placeholder")}
          value={form.buyName}
          onChange={(e) => form.setBuyName(e.target.value)}
        />
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="buy-base-unit">{t("stok.purchase.baseUnit.label")}</Label>
        <Select value={form.unitPreset} onValueChange={form.setUnitPreset}>
          <SelectTrigger id="buy-base-unit" className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BASE_UNIT_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {t(p.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {form.unitPreset === "custom" && (
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="buy-custom-unit">{t("stok.purchase.customUnit.label")}</Label>
          <Input
            id="buy-custom-unit"
            placeholder={t("stok.purchase.customUnit.placeholder")}
            value={form.customUnit}
            onChange={(e) => form.setCustomUnit(e.target.value)}
          />
        </div>
      )}
      <p className="text-sm text-muted-foreground sm:col-span-2">{t("stok.purchase.newHint")}</p>
    </div>
  );
}
