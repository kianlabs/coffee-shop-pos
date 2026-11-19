import { AlertTriangle } from "lucide-react";
import { type SyncMeta } from "@/data/sync";
import { useAppStore } from "@/stores/appStore";

interface SyncStatusProps {
  meta: SyncMeta;
}

export function SyncStatus({ meta }: SyncStatusProps) {
  const pendingCount = useAppStore((s) => s.pendingCount);
  const lastSync = meta.lastSyncAt
    ? new Date(meta.lastSyncAt).toLocaleString("id-ID")
    : "belum pernah";

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-1 gap-2 rounded-md bg-muted p-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Belum terkirim</dt>
          <dd className="font-semibold" data-testid="sync-pending-count">
            {pendingCount === null ? "…" : `${pendingCount} data`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sync terakhir</dt>
          <dd className="font-semibold" data-testid="sync-last-at">
            {lastSync}
          </dd>
        </div>
        {meta.lastPushed > 0 && (
          <div>
            <dt className="text-muted-foreground">Terkirim terakhir</dt>
            <dd className="font-semibold">{meta.lastPushed} ter-ack</dd>
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
          <p className="min-w-0 break-words">Error terakhir: {meta.lastError}</p>
        </div>
      )}
    </div>
  );
}
