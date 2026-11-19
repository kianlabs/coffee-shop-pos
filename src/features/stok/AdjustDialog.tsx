import { ClipboardCheck } from "lucide-react";
import { type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatQtyWithUnit } from "@/domain/units";
import { FormAlert } from "./FormAlert";
import { IngredientSelect } from "./IngredientSelect";
import { parseQty } from "./stockForm";
import { UnitSelect } from "./UnitSelect";
import { useAdjustForm } from "./useAdjustForm";
import { type StockItem } from "./useStockData";

interface AdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: StockItem[];
  initialId: string;
  onSaved: () => Promise<void>;
}

export function AdjustDialog({ open, onOpenChange, items, initialId, onSaved }: AdjustDialogProps) {
  const form = useAdjustForm(items, initialId, onSaved);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (await form.submit()) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !form.busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" data-testid="stok-adjust-dialog">
        <DialogHeader>
          <DialogTitle>{form.selected ? `Koreksi stok ${form.selected.name}` : "Koreksi stok"}</DialogTitle>
          <DialogDescription>
            Untuk stok opname, bahan rusak, atau susut. Alasan wajib diisi agar jejaknya jelas.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <IngredientSelect id="adj-ingredient" value={form.adjId} items={items} onChange={form.selectIngredient} />
          {form.selected && (
            <p className="text-sm text-muted-foreground">
              Stok sekarang: {formatQtyWithUnit(form.selected.stockQty, form.selected.baseUnit)}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="adj-delta">Selisih (+/−)</Label>
              <Input
                id="adj-delta"
                data-testid="stok-adj-delta"
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="mis. -250 atau 1.5"
                value={form.delta || ""}
                onChange={(e) => form.setDelta(parseQty(e.target.value, true))}
              />
            </div>
            <UnitSelect
              id="adj-unit"
              label="Satuan koreksi"
              value={form.inputUnit}
              options={form.unitOptions}
              baseUnit={form.selected?.baseUnit ?? ""}
              disabled={!form.selected}
              onChange={form.setInputUnit}
            />
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="adj-reason">Alasan</Label>
            <Input
              id="adj-reason"
              data-testid="stok-adj-reason"
              placeholder="mis. stok opname / tumpah / kedaluwarsa"
              value={form.reason}
              onChange={(e) => form.setReason(e.target.value)}
            />
          </div>
          <FormAlert message={form.error} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={form.busy} onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" loading={form.busy} data-testid="stok-adj-submit">
              <ClipboardCheck aria-hidden />
              Simpan koreksi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
