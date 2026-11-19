import { useEffect } from "react";
import { refreshPending } from "@/app/useAppBootstrap";
import { BackupCard } from "./BackupCard";
import { RestoreCard } from "./RestoreCard";
import { SyncCard } from "./SyncCard";
import { useBackupList } from "./useBackupActions";

export function BackupScreen() {
  const { backups, refresh } = useBackupList();

  useEffect(() => {
    void refreshPending().catch(() => undefined);
  }, []);

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2" data-testid="backup-screen">
      <BackupCard backups={backups} onSaved={refresh} />
      <RestoreCard onRestored={refresh} />
      <SyncCard />
    </div>
  );
}
