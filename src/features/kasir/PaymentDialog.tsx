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

const METHODS: Array<{ value: PaymentMethod; label: string; icon: LucideIcon; hint?: string }> = [
  { value: "cash", label: "Tunai", icon: Banknote },
  { value: "qris_manual", label: "QRIS", icon: QrCode, hint: "Cek notifikasi pembayaran QRIS berhasil sebelum menyelesaikan." },
  { value: "other", label: "Lainnya", icon: CreditCard, hint: "Pastikan slip EDC atau transfer bank sudah valid." },
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
          <DialogTitle>Pembayaran</DialogTitle>
          <DialogDescription>
            Total tagihan <span className="font-semibold text-foreground tabular-nums">{formatRupiah(totals.total)}</span> · {totals.itemCount} item
          </DialogDescription>
        </DialogHeader>
        <div role="group" aria-label="Metode bayar" className="grid grid-cols-3 gap-2">
          {METHODS.map(({ value, label, icon: Icon }) => (
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
              {label}
            </button>
          ))}
        </div>
        {method === "cash" ? (
          <CashTender total={totals.total} amount={amount} onAmount={setAmount} showNumpad={showNumpad} />
        ) : (
          <p className="rounded-lg bg-info-soft px-4 py-3 text-sm text-info">{selected.hint}</p>
        )}
        <DialogFooter>
          <Button
            size="lg"
            className="h-14 w-full text-base"
            disabled={!canFinish}
            loading={processing}
            onClick={onConfirm}
          >
            {processing ? "Memproses…" : `Selesaikan · ${formatRupiah(totals.total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
