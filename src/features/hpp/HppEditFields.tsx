import { MoneyInput } from "@/components/MoneyInput";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type VariantHppMode } from "@/domain/hppResolve";
import { formatRupiah } from "@/domain/money";
import { t } from "@/services/i18n";
import { PRODUCT_MODES, VARIANT_MODES } from "./hppModel";

interface HppEditFieldsProps {
  isVariant: boolean;
  mode: VariantHppMode;
  manualRp: number;
  disabled: boolean;
  onModeChange: (mode: VariantHppMode) => void;
  onManualChange: (value: number) => void;
}

function isMode(value: string): value is VariantHppMode {
  return VARIANT_MODES.some((m) => m.value === value);
}

export function HppEditFields({ isVariant, mode, manualRp, disabled, onModeChange, onManualChange }: HppEditFieldsProps) {
  const modes = isVariant ? VARIANT_MODES : PRODUCT_MODES;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="hpp-mode">{t("hpp.edit.source.label")}</Label>
        <Select value={mode} disabled={disabled} onValueChange={(v) => isMode(v) && onModeChange(v)}>
          <SelectTrigger id="hpp-mode" className="w-full min-w-0" data-testid="hpp-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modes.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {t(m.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="hpp-manual">{t("hpp.edit.manual.label")}</Label>
        <MoneyInput
          id="hpp-manual"
          data-testid="hpp-manual"
          value={manualRp}
          disabled={disabled || mode !== "manual"}
          onChange={(v) => onManualChange(Math.max(0, v))}
        />
      </div>
      <p className="text-sm text-muted-foreground sm:col-span-2">
        {mode === "manual" && t("hpp.edit.hint.manual")}
        {mode === "recipe" && t("hpp.edit.hint.recipe", { angka: formatRupiah(manualRp) })}
        {mode === "none" && t("hpp.edit.hint.none")}
        {mode === "inherit" && t("hpp.edit.hint.inherit")}
      </p>
    </div>
  );
}
