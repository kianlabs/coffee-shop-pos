import { FileArchive, History } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { type BackupRecord } from "@/data/orderRepo";

interface BackupListProps {
  backups: BackupRecord[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("id-ID");
}

export function BackupList({ backups }: BackupListProps) {
  return (
    <section aria-labelledby="backup-list-title" className="flex flex-col gap-2">
      <h3 id="backup-list-title" className="text-sm font-semibold">
        Backup terakhir
      </h3>
      {backups.length === 0 ? (
        <EmptyState
          icon={History}
          title="Belum ada backup"
          description="Backup yang Anda buat akan muncul di sini."
          className="py-8"
        />
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border" data-testid="backup-list">
          {backups.map((backup) => (
            <li
              key={backup.name + backup.createdAt}
              className="flex items-center gap-3 px-3 py-2"
            >
              <FileArchive className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={backup.name}>
                  {backup.name}
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(backup.createdAt)}</p>
              </div>
              <span className="shrink-0 text-sm text-muted-foreground">
                {backup.orderCount} order
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
