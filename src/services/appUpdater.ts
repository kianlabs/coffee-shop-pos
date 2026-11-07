import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { APP_VERSION, GITHUB_REPO } from "../version.ts";

export interface AvailableUpdate {
  version: string;
  tagName: string;
  title: string;
  notes: string;
  downloadUrl: string;
  sizeBytes: number;
  publishedAt: string;
}

export interface CheckUpdateResult {
  hasUpdate: boolean;
  currentVersion: string;
  update: AvailableUpdate | null;
  message?: string;
}

/**
 * Pembanding semver sederhana (misal 1.1.0 > 1.0.0, 1.0.1 > 1.0.0).
 */
export function isNewerVersion(remoteTag: string, currentVer: string): boolean {
  const clean = (v: string) =>
    v
      .replace(/^v/, "")
      .trim()
      .split(".")
      .map((part) => parseInt(part, 10) || 0);

  const r = clean(remoteTag);
  const c = clean(currentVer);
  const maxLen = Math.max(r.length, c.length);

  for (let i = 0; i < maxLen; i++) {
    const rVal = r[i] ?? 0;
    const cVal = c[i] ?? 0;
    if (rVal > cVal) return true;
    if (rVal < cVal) return false;
  }
  return false;
}

/**
 * Inisialisasi updater saat aplikasi pertama kali dimuat.
 * Wajib memanggil notifyAppReady() agar CapacitorUpdater tahu versi ini berjalan sehat
 * dan tidak melakukan auto-rollback ke versi sebelumnya.
 */
export async function initAppUpdater(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await CapacitorUpdater.notifyAppReady();
    } catch (e) {
      console.warn("[Updater] notifyAppReady warning:", e);
    }
  }
}

/**
 * Mengecek apakah ada rilis terbaru di GitHub Releases yang memiliki asset `dist.zip`.
 */
export async function checkForAppUpdate(
  repo = GITHUB_REPO,
  currentVersion = APP_VERSION,
): Promise<CheckUpdateResult> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return {
          hasUpdate: false,
          currentVersion,
          update: null,
          message: "Belum ada rilis di repositori ini.",
        };
      }
      return {
        hasUpdate: false,
        currentVersion,
        update: null,
        message: `Koneksi GitHub: ${res.statusText} (${res.status})`,
      };
    }

    const data = (await res.json()) as {
      tag_name?: string;
      name?: string;
      body?: string;
      published_at?: string;
      assets?: Array<{ name: string; browser_download_url: string; size: number }>;
    };

    const remoteTag = data.tag_name || "";
    if (!remoteTag) {
      return {
        hasUpdate: false,
        currentVersion,
        update: null,
        message: "Format rilis GitHub tidak memiliki tag versi.",
      };
    }

    const hasNewer = isNewerVersion(remoteTag, currentVersion);
    if (!hasNewer) {
      return {
        hasUpdate: false,
        currentVersion,
        update: null,
        message: `Aplikasi sudah versi terbaru (v${currentVersion}).`,
      };
    }

    // Cari asset file dist.zip di GitHub Release
    const zipAsset = data.assets?.find(
      (a) => a.name.toLowerCase() === "dist.zip" || a.name.toLowerCase().endsWith(".zip"),
    );

    if (!zipAsset) {
      return {
        hasUpdate: false,
        currentVersion,
        update: null,
        message: `Versi ${remoteTag} ditemukan, namun file paket dist.zip belum tersedia.`,
      };
    }

    const cleanVer = remoteTag.replace(/^v/, "");
    return {
      hasUpdate: true,
      currentVersion,
      update: {
        version: cleanVer,
        tagName: remoteTag,
        title: data.name || remoteTag,
        notes: data.body || "Pembaruan performa dan perbaikan bug.",
        downloadUrl: zipAsset.browser_download_url,
        sizeBytes: zipAsset.size,
        publishedAt: data.published_at || new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      hasUpdate: false,
      currentVersion,
      update: null,
      message: err instanceof Error ? err.message : "Tidak dapat terhubung ke internet.",
    };
  }
}

/**
 * Mendownload file zip dari GitHub Releases dan menerapkannya langsung (Live Update).
 */
export async function downloadAndApplyUpdate(
  update: AvailableUpdate,
  onProgress?: (percent: number) => void,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error(
      "Live Update OTA hanya dapat diterapkan pada aplikasi Android tablet (bukan di browser).",
    );
  }

  let listenerHandle: { remove: () => Promise<void> } | null = null;
  if (onProgress) {
    listenerHandle = await CapacitorUpdater.addListener("download", (info) => {
      if (typeof info.percent === "number") {
        onProgress(Math.round(info.percent));
      }
    });
  }

  try {
    // 1. Download bundle zip
    const downloaded = await CapacitorUpdater.download({
      url: update.downloadUrl,
      version: update.version,
    });

    // 2. Set bundle baru sebagai versi aktif
    await CapacitorUpdater.set(downloaded);

    // 3. Reload WebView aplikasi seketika
    await CapacitorUpdater.reload();
  } finally {
    if (listenerHandle) {
      await listenerHandle.remove();
    }
  }
}
