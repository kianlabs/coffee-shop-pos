/**
 * Jembatan penyimpanan file backup di Android.
 *
 * Di WebView, blob + `<a download>` tidak menghasilkan file — backup POS tidak
 * pernah tersimpan. Plugin native `BackupPlugin` menulis ke folder dokumen
 * aplikasi (tanpa izin storage) lalu membuka chooser Android untuk
 * menyimpan/mengirim ke Drive, WhatsApp, dsb.
 */
type BackupPluginBridge = {
  save: (args: { fileName: string; content: string }) => Promise<{ path?: string; bytes?: number }>;
  share: (args: { fileName: string }) => Promise<{ shared?: boolean }>;
  list?: () => Promise<{ files?: Array<{ name: string; bytes: number; modified: number }> }>;
};

function backupBridge(): BackupPluginBridge | null {
  const w = window as unknown as {
    Capacitor?: { Plugins?: { BackupPlugin?: BackupPluginBridge } };
  };
  const plugin = w.Capacitor?.Plugins?.BackupPlugin;
  return plugin && typeof plugin.save === "function" ? plugin : null;
}

export function isNativeBackupAvailable(): boolean {
  return backupBridge() !== null;
}

/**
 * Simpan konten ke file di perangkat. Mengembalikan path absolut, atau null
 * bila plugin native tidak ada (browser biasa).
 */
export async function saveBackupFile(fileName: string, content: string): Promise<string | null> {
  const plugin = backupBridge();
  if (!plugin) return null;
  const res = await plugin.save({ fileName, content });
  return res?.path ?? null;
}

/** Buka chooser Android untuk membagikan file yang sudah disimpan. */
export async function shareBackupFile(fileName: string): Promise<boolean> {
  const plugin = backupBridge();
  if (!plugin) return false;
  const res = await plugin.share({ fileName });
  return res?.shared === true;
}

export async function listBackupFiles(): Promise<Array<{ name: string; bytes: number; modified: number }>> {
  const plugin = backupBridge();
  if (!plugin?.list) return [];
  const res = await plugin.list();
  return Array.isArray(res?.files) ? res.files : [];
}
