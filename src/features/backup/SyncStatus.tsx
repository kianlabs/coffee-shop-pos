import { AlertTriangle } from "lucide-react";
import { type SyncMeta } from "@/data/sync";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";

interface SyncStatusProps {
  meta: SyncMeta;
}

export function SyncStatus({ meta }: SyncStatusProps) {
  const pendingCount = useAppStore((s) => s.pendingCount);
  const lastSync = meta.lastSyncAt
    ? new Date(meta.lastSyncAt).toLocaleString("id-ID")
    : t("backup.status.never");

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-1 gap-2 rounded-md bg-muted p-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">{t("backup.status.pending")}</dt>
          <dd className="font-semibold" data-testid="sync-pending-count">
            {pendingCount === null ? "…" : t("backup.status.pendingCount", { jumlah: pendingCount })}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("backup.status.lastSync")}</dt>
          <dd className="font-semibold" data-testid="sync-last-at">
            {lastSync}
          </dd>
        </div>
        {meta.lastPushed > 0 && (
          <div>
            <dt className="text-muted-foreground">{t("backup.status.lastPushed")}</dt>
            <dd className="font-semibold">
              {t("backup.status.acked", { jumlah: meta.lastPushed })}
            </dd>
          </div>
        )}
      </dl>
      {meta.lastError && (
        <div
          role="alert"
          className="flex gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          data-testid="sync-last-error"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="min-w-0 break-words">
            {t("backup.status.lastError", { pesan: meta.lastError })}
          </p>
        </div>
      )}
    </div>
  );
}
