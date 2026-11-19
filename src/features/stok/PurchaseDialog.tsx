import { PackagePlus } from "lucide-react";
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
import { t } from "@/services/i18n";
import { FormAlert } from "./FormAlert";
import { IngredientSelect } from "./IngredientSelect";
import { PurchaseAmountFields } from "./PurchaseAmountFields";
import { PurchaseNewFields } from "./PurchaseNewFields";
import { usePurchaseForm } from "./usePurchaseForm";
import { type StockItem } from "./useStockData";

interface PurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: StockItem[];
  /** Ingredient to preselect; "" starts with a new ingredient. */
  initialId: string;
  onSaved: () => Promise<void>;
}

export function PurchaseDialog({ open, onOpenChange, items, initialId, onSaved }: PurchaseDialogProps) {
  const form = usePurchaseForm(items, initialId, onSaved);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (await form.submit()) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !form.busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" data-testid="stok-purchase-dialog">
        <DialogHeader>
          <DialogTitle>
            {form.selected ? t("stok.purchase.titleNamed", { nama: form.selected.name }) : t("stok.purchase.title")}
          </DialogTitle>
          <DialogDescription>{t("stok.purchase.description")}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <IngredientSelect
            id="buy-ingredient"
            value={form.buyId}
            items={items}
            allowNew
            onChange={form.selectIngredient}
          />
          {!form.selected && <PurchaseNewFields form={form} />}
          <PurchaseAmountFields form={form} />
          <FormAlert message={form.error} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={form.busy} onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={form.busy} data-testid="stok-buy-submit">
              <PackagePlus aria-hidden />
              {t("stok.purchase.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
