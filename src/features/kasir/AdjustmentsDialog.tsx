import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/MoneyInput";
import { formatRupiah } from "@/domain/money";
import { t } from "@/services/i18n";
import { useCartStore } from "@/stores/cartStore";

interface AdjustmentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtotal: number;
}

/** Edits a draft and applies it on "Terapkan", so cancelling changes nothing. */
export function AdjustmentsDialog({ open, onOpenChange, subtotal }: AdjustmentsDialogProps) {
  const discount = useCartStore((s) => s.discount);
  const tax = useCartStore((s) => s.tax);
  const setDiscount = useCartStore((s) => s.setDiscount);
  const setTax = useCartStore((s) => s.setTax);
  const [draft, setDraft] = useState({ discount, tax });

  function handleOpenChange(next: boolean) {
    if (next) setDraft({ discount, tax });
    onOpenChange(next);
  }

  const tooMuch = draft.discount > subtotal;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("kasir.adjust.title")}</DialogTitle>
          <DialogDescription>
            {t("kasir.adjust.description", { subtotal: formatRupiah(subtotal) })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cart-discount">{t("kasir.adjust.discountLabel")}</Label>
            <MoneyInput
              id="cart-discount"
              value={draft.discount}
              allowEmpty
              aria-invalid={tooMuch || undefined}
              onChange={(v) => setDraft((d) => ({ ...d, discount: Math.max(0, v) }))}
            />
            {tooMuch && (
              <p className="text-sm text-destructive">
                {t("kasir.adjust.tooMuch", { subtotal: formatRupiah(subtotal) })}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cart-tax">{t("kasir.adjust.taxLabel")}</Label>
            <MoneyInput
              id="cart-tax"
              value={draft.tax}
              allowEmpty
              onChange={(v) => setDraft((d) => ({ ...d, tax: Math.max(0, v) }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("kasir.common.cancel")}</Button>
          <Button
            disabled={tooMuch}
            onClick={() => {
              setDiscount(draft.discount);
              setTax(draft.tax);
              onOpenChange(false);
            }}
          >
            {t("kasir.adjust.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
