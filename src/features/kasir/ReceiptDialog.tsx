import { useRef, useState } from "react";
import { CircleCheck, Printer } from "lucide-react";
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
import { paymentLabel } from "@/data/receipt";
import { errorMessage, notify } from "@/lib/notify";
import { printOrder } from "@/lib/printing";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";
import { useKasirUi } from "./kasirUiStore";
import { ReceiptLogo } from "./ReceiptLogo";

export function ReceiptDialog() {
  const receipt = useKasirUi((s) => s.receipt);
  const setReceipt = useKasirUi((s) => s.setReceipt);
  const [printing, setPrinting] = useState(false);
  const doneRef = useRef<HTMLButtonElement>(null);

  async function reprint() {
    if (!receipt) return;
    const { storeProfile, posSettings } = useAppStore.getState();
    setPrinting(true);
    try {
      const name = await printOrder(receipt.order, storeProfile, posSettings);
      notify.success(t("kasir.receipt.printed", { receipt: receipt.order.receiptNumber, printer: name }));
    } catch (e) {
      const reason = errorMessage(e, t("kasir.error.printerNoResponse"));
      notify.error(t("kasir.receipt.printFailed", { reason }));
    } finally {
      setPrinting(false);
    }
  }

  const order = receipt?.order;
  return (
    <Dialog open={receipt !== null} onOpenChange={(open) => !open && setReceipt(null)}>
      <DialogContent
        className="max-h-[95dvh] overflow-y-auto sm:max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          doneRef.current?.focus();
        }}
      >
        <DialogHeader className="items-center text-center">
          <CircleCheck className="size-12 text-success" aria-hidden />
          <DialogTitle className="text-xl">{t("kasir.receipt.title")}</DialogTitle>
          <DialogDescription>
            {t("kasir.receipt.description", {
              receipt: order?.receiptNumber ?? "",
              method: order ? paymentLabel(order.payment.method) : "",
            })}
          </DialogDescription>
        </DialogHeader>
        {order && (
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">{t("kasir.summary.total")}</p>
              <p className="text-lg font-semibold tabular-nums">{formatRupiah(order.totalRp)}</p>
            </div>
            <div className="rounded-lg bg-success-soft p-3 text-success">
              <p className="text-xs">{t("kasir.receipt.change")}</p>
              <p className="text-lg font-bold tabular-nums">{formatRupiah(order.changeRp)}</p>
            </div>
          </div>
        )}
        <ReceiptLogo />
        <pre
          data-testid="receipt-preview"
          aria-label={t("kasir.receipt.previewLabel")}
          className="max-h-56 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre"
        >
          {receipt?.text}
        </pre>
        <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          <Button variant="outline" loading={printing} onClick={() => void reprint()}>
            {!printing && <Printer />} {t("kasir.receipt.print")}
          </Button>
          <Button ref={doneRef} onClick={() => setReceipt(null)}>
            {t("kasir.receipt.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
