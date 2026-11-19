import { useCallback, useState } from "react";
import { refreshPending } from "@/app/useAppBootstrap";
import {
  loadSyncMeta,
  loadSyncSettings,
  saveSyncSettings,
  syncNow,
  type SyncMeta,
  type SyncSettings,
} from "@/data/sync";
import { errorMessage, notify } from "@/lib/notify";

/**
 * Sync form state. Endpoint + device id persist in localStorage; the API key
 * stays in memory + sessionStorage only (handled by saveSyncSettings).
 * "Sync sekarang" uses the form values as typed, like the old screen did.
 */
export function useSyncActions() {
  const [settings, setSettings] = useState<SyncSettings>(() => loadSyncSettings());
  const [meta, setMeta] = useState<SyncMeta>(() => loadSyncMeta());
  const [syncing, setSyncing] = useState(false);

  const update = useCallback((patch: Partial<SyncSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const save = useCallback(() => {
    try {
      saveSyncSettings(settings);
      notify.success("Pengaturan sync disimpan.");
    } catch (e) {
      notify.error(errorMessage(e, "Gagal menyimpan pengaturan sync."));
    }
  }, [settings]);

  const runSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await syncNow(settings);
      const rej = r.rejected.length > 0 ? `, ${r.rejected.length} ditolak server` : "";
      notify.success(`Sync selesai: ${r.acked.length} ter-ack${rej}.`);
    } catch (e) {
      notify.error(errorMessage(e, "Sync gagal."));
    } finally {
      setMeta(loadSyncMeta());
      await refreshPending().catch(() => undefined);
      setSyncing(false);
    }
  }, [settings, syncing]);

  return { settings, meta, syncing, update, save, runSync };
}
