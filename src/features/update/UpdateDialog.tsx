import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadAndApplyUpdate } from "@/services/appUpdater";
import { errorMessage, notify } from "@/lib/notify";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";
import { APP_VERSION } from "@/version";

export function UpdateDialog() {
  const update = useAppStore((s) => s.availableUpdate);
  const open = useAppStore((s) => s.updateDialogOpen);
  const setOpen = useAppStore((s) => s.setUpdateDialogOpen);
  const [progress, setProgress] = useState<number | null>(null);
  const busy = progress !== null;

  async function apply() {
    if (!update) return;
    setProgress(0);
    try {
      await downloadAndApplyUpdate(update, setProgress);
    } catch (e) {
      setProgress(null);
      notify.error(errorMessage(e, t("app.error.installUpdate")));
    }
  }

  return (
    <Dialog open={open && update !== null} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("app.update.title")}</DialogTitle>
          <DialogDescription>{t("app.update.description")}</DialogDescription>
        </DialogHeader>
        {update && (
          <div className="grid gap-3 text-sm">
            <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-3">
              <div><dt className="text-muted-foreground">{t("app.update.current")}</dt><dd className="font-semibold">v{APP_VERSION}</dd></div>
              <div><dt className="text-muted-foreground">{t("app.update.new")}</dt><dd className="font-semibold">{update.tagName}</dd></div>
              <div><dt className="text-muted-foreground">{t("app.update.size")}</dt><dd className="font-semibold">{(update.sizeBytes / (1024 * 1024)).toFixed(2)} MB</dd></div>
            </dl>
            <div>
              <p className="mb-1 font-medium">{t("app.update.notes")}</p>
              <p className="max-h-48 overflow-y-auto whitespace-pre-line text-muted-foreground">{update.notes}</p>
            </div>
            {busy && (
              <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={t("app.update.downloadingAria")}>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("app.update.downloading", { persen: progress ?? 0 })}</p>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t("app.update.later")}</Button>
          <Button loading={busy} onClick={() => void apply()}>
            {!busy && <Download />} {busy ? t("app.update.installing") : t("app.update.installNow")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
