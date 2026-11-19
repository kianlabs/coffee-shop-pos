import { useRef } from "react";
import { KeyRound } from "lucide-react";
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
import { MAX_PIN_ATTEMPTS } from "@/data/settings";
import { t } from "@/services/i18n";
import { actionLabel } from "./historyUtils";
import { type VoidPinState } from "./useVoidPin";

interface PinDialogProps {
  pin: VoidPinState;
}

export function PinDialog({ pin }: PinDialogProps) {
  const { request, verifying } = pin;
  const inputRef = useRef<HTMLInputElement>(null);
  const title =
    request?.action === "refund" ? t("riwayat.pin.titleRefund") : t("riwayat.pin.titleVoid");
  const showAttempts = pin.error === null && pin.attempts > 0;

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) pin.cancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        onEscapeKeyDown={(e) => verifying && e.preventDefault()}
        onInteractOutside={(e) => verifying && e.preventDefault()}
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void pin.submit();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5" aria-hidden />
              {title}
            </DialogTitle>
            <DialogDescription>
              {request
                ? t("riwayat.pin.description", {
                    action: actionLabel(request.action),
                    label: request.label,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="riwayat-void-pin">{title}</Label>
            <Input
              id="riwayat-void-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              ref={inputRef}
              value={pin.input}
              disabled={verifying}
              aria-invalid={pin.error !== null || undefined}
              aria-describedby="riwayat-void-pin-msg"
              onChange={(e) => pin.setInput(e.target.value)}
              className="h-13 text-center text-xl tracking-[0.2em]"
            />
            <p id="riwayat-void-pin-msg" role="alert" className="min-h-5 text-sm">
              {pin.error && <span className="text-destructive">{pin.error}</span>}
              {showAttempts && (
                <span className="text-muted-foreground">
                  {t("riwayat.pin.attempts", { attempts: pin.attempts, max: MAX_PIN_ATTEMPTS })}
                </span>
              )}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={verifying} onClick={pin.cancel}>
              {t("riwayat.pin.cancel")}
            </Button>
            <Button type="submit" loading={verifying}>
              {verifying ? t("riwayat.pin.checking") : t("riwayat.pin.continue")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
