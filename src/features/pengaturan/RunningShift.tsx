import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/domain/money";
import { type Shift, type ShiftSummary } from "@/domain/shifts";
import { t } from "@/services/i18n";

interface RunningShiftProps {
  shift: Shift;
  summary: ShiftSummary | null;
  truncated: boolean;
  closing: boolean;
  onClose: () => Promise<void>;
}

export function RunningShift({ shift, summary, truncated, closing, onClose }: RunningShiftProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const name = shift.cashierName || t("pengaturan.common.noName");
  const openedAt = new Date(shift.openedAt).toLocaleString("id-ID");
  return (
    <div className="flex flex-col gap-4" data-testid="shift-running">
      <div className="flex flex-col gap-2 rounded-md bg-success-soft p-3 text-sm">
        <Badge variant="outline" className="gap-1 bg-card text-success">
          <CheckCircle2 aria-hidden />
          {t("pengaturan.shift.running.badge")}
        </Badge>
        <p>
          {t("pengaturan.shift.running.cashier")} <span className="font-semibold">{name}</span>
        </p>
        <p className="text-muted-foreground">
          {t("pengaturan.shift.running.openedAt", { waktu: openedAt })}
          {shift.openCashRp > 0 && t("pengaturan.shift.running.openCash", { jumlah: formatRupiah(shift.openCashRp) })}
        </p>
        {summary && (
          <p data-testid="shift-summary">
            {truncated ? "≥" : ""}
            {t("pengaturan.shift.running.orders", { jumlah: summary.orderCount })} ·{" "}
            <span className="font-semibold">{formatRupiah(summary.grandTotalRp)}</span>
          </p>
        )}
      </div>
      {truncated && (
        <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm" role="note">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          {t("pengaturan.shift.running.truncatedNote")}
        </p>
      )}
      <Button type="button" variant="outline" className="w-full sm:w-fit" loading={closing} onClick={() => setConfirmOpen(true)}>
        {!closing && <CheckCircle2 aria-hidden />}
        {t("pengaturan.shift.close")}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("pengaturan.shift.confirmClose.title")}
        description={t("pengaturan.shift.confirmClose.description", { nama: name, waktu: openedAt })}
        confirmLabel={t("pengaturan.shift.close")}
        onConfirm={() => void onClose()}
      />
    </div>
  );
}
