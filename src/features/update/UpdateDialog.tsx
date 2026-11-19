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
      notify.error(errorMessage(e, "Gagal memasang pembaruan."));
    }
  }

  return (
    <Dialog open={open && update !== null} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pembaruan tersedia</DialogTitle>
          <DialogDescription>Versi baru siap diunduh dan dipasang. Data penjualan tidak terhapus.</DialogDescription>
        </DialogHeader>
        {update && (
          <div className="grid gap-3 text-sm">
            <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-3">
              <div><dt className="text-muted-foreground">Saat ini</dt><dd className="font-semibold">v{APP_VERSION}</dd></div>
              <div><dt className="text-muted-foreground">Baru</dt><dd className="font-semibold">{update.tagName}</dd></div>
              <div><dt className="text-muted-foreground">Ukuran</dt><dd className="font-semibold">{(update.sizeBytes / (1024 * 1024)).toFixed(2)} MB</dd></div>
            </dl>
            <div>
              <p className="mb-1 font-medium">Catatan rilis</p>
              <p className="max-h-48 overflow-y-auto whitespace-pre-line text-muted-foreground">{update.notes}</p>
            </div>
            {busy && (
              <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Mengunduh pembaruan">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Mengunduh: {progress}%</p>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Nanti saja</Button>
          <Button loading={busy} onClick={() => void apply()}>
            {!busy && <Download />} {busy ? "Memasang…" : "Perbarui sekarang"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
