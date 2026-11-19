import { useEffect } from "react";
import { loadCatalog } from "@/data/catalogRepo";
import { repo } from "@/data/orderRepo";
import { migrateLegacyVoidPin } from "@/data/settings";
import { loadStoreProfile } from "@/data/storeProfile";
import { countPendingOutbox, loadSyncMeta, loadSyncSettings, syncNow } from "@/data/sync";
import { checkForAppUpdate, initAppUpdater } from "@/services/appUpdater";
import { errorMessage, notify } from "@/lib/notify";
import { useAppStore } from "@/stores/appStore";

const SYNC_INTERVAL_MS = 60_000;
const UPDATE_CHECK_DELAY_MS = 3_500;

function useOrdersLoader() {
  const ordersVersion = useAppStore((s) => s.ordersVersion);
  useEffect(() => {
    let cancelled = false;
    repo
      .load(200)
      .then((rows) => {
        if (cancelled) return;
        useAppStore.getState().setOrders(rows);
        useAppStore.getState().setDbReady(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) notify.error(errorMessage(e, "Gagal memuat order."));
      });
    return () => {
      cancelled = true;
    };
  }, [ordersVersion]);
}

function useCatalogLoader() {
  const catalogVersion = useAppStore((s) => s.catalogVersion);
  useEffect(() => {
    let cancelled = false;
    loadCatalog()
      .then((next) => {
        if (!cancelled) useAppStore.getState().setCatalog(next);
      })
      .catch(() => {
        // The cashier screen shows an empty catalog instead of a blank page.
      });
    return () => {
      cancelled = true;
    };
  }, [catalogVersion]);
}

function useStoreProfileLoader() {
  const dbReady = useAppStore((s) => s.dbReady);
  useEffect(() => {
    if (!dbReady) return;
    let cancelled = false;
    loadStoreProfile()
      .then((profile) => {
        if (!cancelled) useAppStore.getState().setStoreProfile(profile);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dbReady]);
}

function useOnlineStatus() {
  useEffect(() => {
    const up = () => useAppStore.getState().setOnline(true);
    const down = () => useAppStore.getState().setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
}

async function refreshPending(): Promise<void> {
  const count = await countPendingOutbox().catch(() => null);
  useAppStore.getState().setPendingCount(count);
}

function useBackgroundSync() {
  useEffect(() => {
    let cancelled = false;
    void refreshPending();
    const timer = window.setInterval(async () => {
      if (cancelled || document.hidden || !navigator.onLine) return;
      await syncNow(loadSyncSettings()).catch(() => undefined);
      if (cancelled) return;
      useAppStore.getState().setSyncMeta(loadSyncMeta());
      await refreshPending();
    }, SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
}

function useStartupTasks() {
  useEffect(() => {
    let cancelled = false;
    // Plaintext void PIN from old installs is replaced by a PBKDF2 hash once.
    void migrateLegacyVoidPin()
      .then((migrated) => {
        if (!cancelled && migrated) useAppStore.getState().setPosSettings(migrated);
      })
      .catch(() => undefined);
    void initAppUpdater();
    const timer = window.setTimeout(() => {
      void checkForAppUpdate()
        .then((res) => {
          if (!cancelled && res.hasUpdate && res.update) {
            useAppStore.getState().setAvailableUpdate(res.update);
          }
        })
        .catch(() => undefined);
    }, UPDATE_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
}

export function useAppBootstrap(): void {
  useStartupTasks();
  useOrdersLoader();
  useCatalogLoader();
  useStoreProfileLoader();
  useOnlineStatus();
  useBackgroundSync();
}

export { refreshPending };
