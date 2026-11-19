import { Banknote, CreditCard, QrCode, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatRupiah } from "@/domain/money";
import { type PaymentMethod } from "@/domain/orders";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";
import { useCartStore } from "@/stores/cartStore";
import { type CartTotals } from "@/stores/useCartTotals";
import { CashTender } from "./CashTender";

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totals: CartTotals;
  processing: boolean;
  onConfirm: () => void;
}

const METHODS: Array<{ value: PaymentMethod; labelKey: string; icon: LucideIcon; hintKey?: string }> = [
  { value: "cash", labelKey: "kasir.pay.method.cash", icon: Banknote },
  { value: "qris_manual", labelKey: "kasir.pay.method.qris", icon: QrCode, hintKey: "kasir.pay.hint.qris" },
  { value: "other", labelKey: "kasir.pay.method.other", icon: CreditCard, hintKey: "kasir.pay.hint.other" },
];

export function PaymentDialog({ open, onOpenChange, totals, processing, onConfirm }: PaymentDialogProps) {
  const method = useCartStore((s) => s.payMethod);
  const amount = useCartStore((s) => s.payAmount);
  const setMethod = useCartStore((s) => s.setPayMethod);
  const setAmount = useCartStore((s) => s.setPayAmount);
  const showNumpad = useAppStore((s) => s.posSettings.showCashNumpad);
  const selected = METHODS.find((m) => m.value === method) ?? METHODS[0];
  const canFinish = method !== "cash" || amount >= totals.total;

  return (
    <Dialog open={open} onOpenChange={(next) => !processing && onOpenChange(next)}>
      <DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-lg" data-testid="payment-dialog">
        <DialogHeader>
          <DialogTitle>{t("kasir.pay.title")}</DialogTitle>
          <DialogDescription>
            {t("kasir.pay.totalPrefix")}{" "}
            <span className="font-semibold text-foreground tabular-nums">{formatRupiah(totals.total)}</span>
            {" · "}
            {t("kasir.pay.itemCount", { count: totals.itemCount })}
          </DialogDescription>
        </DialogHeader>
        <div role="group" aria-label={t("kasir.pay.methodGroup")} className="grid grid-cols-3 gap-2">
          {METHODS.map(({ value, labelKey, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === method}
              onClick={() => setMethod(value)}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 rounded-lg border text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                value === method ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {t(labelKey)}
            </button>
          ))}
        </div>
        {method === "cash" ? (
          <CashTender total={totals.total} amount={amount} onAmount={setAmount} showNumpad={showNumpad} />
        ) : (
          <p className="rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
            {selected.hintKey ? t(selected.hintKey) : null}
          </p>
        )}
        <DialogFooter>
          <Button
            size="lg"
            className="h-14 w-full text-base"
            disabled={!canFinish}
            loading={processing}
            onClick={onConfirm}
          >
            {processing
              ? t("kasir.pay.processing")
              : t("kasir.pay.finish", { amount: formatRupiah(totals.total) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
