import { useCallback, useState } from "react";
import { refreshPending } from "@/app/useAppBootstrap";
import { useAppStore } from "@/stores/appStore";
import {
  loadSyncMeta,
  loadSyncSettings,
  saveSyncSettings,
  syncNow,
  type SyncSettings,
} from "@/data/sync";
import { errorMessage, notify } from "@/lib/notify";
import { t } from "@/services/i18n";

/**
 * Sync form state. Endpoint + device id persist in localStorage; the API key
 * stays in memory + sessionStorage only (handled by saveSyncSettings).
 * "Sync sekarang" uses the form values as typed, like the old screen did.
 */
export function useSyncActions() {
  const [settings, setSettings] = useState<SyncSettings>(() => loadSyncSettings());
  const meta = useAppStore((s) => s.syncMeta);
  const setMeta = useAppStore((s) => s.setSyncMeta);
  const [syncing, setSyncing] = useState(false);

  const update = useCallback((patch: Partial<SyncSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const save = useCallback(() => {
    try {
      saveSyncSettings(settings);
      notify.success(t("backup.sync.saved"));
    } catch (e) {
      notify.error(errorMessage(e, t("backup.sync.saveFailed")));
    }
  }, [settings]);

  const runSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await syncNow(settings);
      const tolak =
        r.rejected.length > 0 ? t("backup.sync.rejected", { jumlah: r.rejected.length }) : "";
      notify.success(t("backup.sync.done", { diterima: r.acked.length, tolak }));
    } catch (e) {
      notify.error(errorMessage(e, t("backup.sync.failed")));
    } finally {
      setMeta(loadSyncMeta());
      await refreshPending().catch(() => undefined);
      setSyncing(false);
    }
  }, [settings, syncing, setMeta]);

  return { settings, meta, syncing, update, save, runSync };
}
