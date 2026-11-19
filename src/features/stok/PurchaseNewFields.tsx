import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
        <Label htmlFor="buy-name">Nama bahan</Label>
        <Input
          id="buy-name"
          data-testid="stok-buy-name"
          placeholder="mis. Biji kopi"
          value={form.buyName}
          onChange={(e) => form.setBuyName(e.target.value)}
        />
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="buy-base-unit">Satuan dasar</Label>
        <Select value={form.unitPreset} onValueChange={form.setUnitPreset}>
          <SelectTrigger id="buy-base-unit" className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BASE_UNIT_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {form.unitPreset === "custom" && (
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="buy-custom-unit">Satuan dasar kustom</Label>
          <Input
            id="buy-custom-unit"
            placeholder="mis. butir / bungkus / ikat"
            value={form.customUnit}
            onChange={(e) => form.setCustomUnit(e.target.value)}
          />
        </div>
      )}
      <p className="text-sm text-muted-foreground sm:col-span-2">
        Stok dan HPP bahan dicatat dalam satuan dasar. Satuan pembelian di bawah boleh berbeda
        (mis. beli dalam kg, disimpan dalam g).
      </p>
    </div>
  );
}
