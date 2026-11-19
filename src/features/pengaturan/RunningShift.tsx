import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/domain/money";
import { type Shift, type ShiftSummary } from "@/domain/shifts";

interface RunningShiftProps {
  shift: Shift;
  summary: ShiftSummary | null;
  truncated: boolean;
  closing: boolean;
  onClose: () => Promise<void>;
}

export function RunningShift({ shift, summary, truncated, closing, onClose }: RunningShiftProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const name = shift.cashierName || "(tanpa nama)";
  const openedAt = new Date(shift.openedAt).toLocaleString("id-ID");
  return (
    <div className="flex flex-col gap-4" data-testid="shift-running">
      <div className="flex flex-col gap-2 rounded-md bg-success-soft p-3 text-sm">
        <Badge variant="outline" className="gap-1 bg-card text-success">
          <CheckCircle2 aria-hidden />
          Shift berjalan
        </Badge>
        <p>
          Kasir: <span className="font-semibold">{name}</span>
        </p>
        <p className="text-muted-foreground">
          Dibuka {openedAt}
          {shift.openCashRp > 0 && ` · Modal awal ${formatRupiah(shift.openCashRp)}`}
        </p>
        {summary && (
          <p data-testid="shift-summary">
            {truncated ? "≥" : ""}
            {summary.orderCount} order · <span className="font-semibold">{formatRupiah(summary.grandTotalRp)}</span>
          </p>
        )}
      </div>
      {truncated && (
        <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm" role="note">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          Angka di atas dihitung dari 200 order terbaru saja. Total lengkap dihitung saat shift ditutup.
        </p>
      )}
      <Button type="button" variant="outline" className="w-full sm:w-fit" loading={closing} onClick={() => setConfirmOpen(true)}>
        {!closing && <CheckCircle2 aria-hidden />}
        Tutup shift
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Tutup shift?"
        description={`Shift ${name} yang dibuka ${openedAt} akan ditutup. Ringkasan dihitung dari semua order selama shift. Shift yang sudah ditutup tidak bisa dibuka lagi.`}
        confirmLabel="Tutup shift"
        onConfirm={() => void onClose()}
      />
    </div>
  );
}
