import { useCallback, useState } from "react";
import { saveBackupFile, shareBackupFile } from "@/data/backupFile";
import { encryptJson } from "@/data/cryptoBackup";
import {
  backupFileName,
  downloadTextFile,
  rememberBackup,
  repo,
  type BackupRecord,
} from "@/data/orderRepo";
import { errorMessage, notify } from "@/lib/notify";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";

type BackupKind = "plain" | "encrypted";

/** Order count from the exported JSON; falls back to the orders in memory. */
function countOrders(json: string): number {
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed === "object" && parsed !== null) {
      const orders = (parsed as Record<string, unknown>).orders;
      if (Array.isArray(orders)) return orders.length;
    }
  } catch {
    // Use the in-memory count when the JSON cannot be parsed.
  }
  return useAppStore.getState().orders.length;
}

/**
 * Android: a blob download produces no file, so the native plugin saves and
 * shares it. Browser: regular download. Returns the saved path or null.
 */
async function writeBackupFile(name: string, content: string): Promise<string | null> {
  let savedPath: string | null = null;
  try {
    savedPath = await saveBackupFile(name, content);
  } catch {
    savedPath = null;
  }
  if (savedPath) {
    await shareBackupFile(name).catch(() => undefined);
  } else {
    downloadTextFile(content, name);
  }
  return savedPath;
}

function newRecord(name: string, orderCount: number): BackupRecord {
  return { name, createdAt: new Date().toISOString(), orderCount };
}

async function backupPlain(): Promise<string> {
  const json = await repo.exportJson();
  const orderCount = countOrders(json);
  const record = newRecord(backupFileName(), orderCount);
  const savedPath = await writeBackupFile(record.name, json);
  rememberBackup(record);
  return savedPath
    ? t("backup.plain.savedPath", { lokasi: savedPath, jumlah: orderCount })
    : t("backup.plain.downloaded", { nama: record.name, jumlah: orderCount });
}

async function backupEncrypted(passphrase: string): Promise<string> {
  const json = await repo.exportJson();
  const enc = await encryptJson(json, passphrase);
  const name = backupFileName().replace(/\.json$/, "") + ".enc.json";
  const record = newRecord(name, countOrders(json));
  const savedPath = await writeBackupFile(record.name, enc);
  rememberBackup(record);
  return savedPath
    ? t("backup.encrypted.savedPath", { lokasi: savedPath })
    : t("backup.encrypted.downloaded", { nama: record.name });
}

/** Recent backups from the shared index (localStorage, max 20). */
export function useBackupList() {
  const [backups, setBackups] = useState<BackupRecord[]>(() => repo.listBackups());
  const refresh = useCallback(() => setBackups(repo.listBackups()), []);
  return { backups, refresh };
}

export function useBackupActions(onSaved: () => void) {
  const [busy, setBusy] = useState<BackupKind | null>(null);

  const run = useCallback(
    async (kind: BackupKind, passphrase: string) => {
      if (busy) return;
      if (kind === "encrypted" && !passphrase) {
        notify.error(t("backup.encrypted.passphraseRequired"));
        return;
      }
      setBusy(kind);
      try {
        const msg = kind === "plain" ? await backupPlain() : await backupEncrypted(passphrase);
        onSaved();
        notify.success(msg);
      } catch (e) {
        const fallback =
          kind === "plain" ? t("backup.plain.failed") : t("backup.encrypted.failed");
        notify.error(errorMessage(e, fallback));
      } finally {
        setBusy(null);
      }
    },
    [busy, onSaved],
  );

  return { busy, run };
}
