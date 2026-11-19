// Pure updater logic (OTA manifest, checksum, schema gate, check interval).
// No I/O, no clock: callers pass the computed hash, the time and the settings.
import { isNewerVersion } from "../domain/semver";

export interface OtaManifest {
  version: string;
  minNativeVersion: string;
  schemaVersion: number;
  sha256: string;
}

export type ManifestResult = { ok: true; manifest: OtaManifest } | { ok: false; message: string };

const SHA256_HEX = /^[0-9a-fA-F]{64}$/;
const VERSION = /^v?\d+(\.\d+){0,2}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parses `ota-manifest.json` content (already JSON.parsed or a raw string). */
export function parseOtaManifest(input: unknown): ManifestResult {
  let data = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch {
      return { ok: false, message: "Manifest pembaruan bukan JSON yang valid." };
    }
  }
  if (!isRecord(data)) return { ok: false, message: "Manifest pembaruan tidak valid." };
  const { version, minNativeVersion, schemaVersion, sha256 } = data;
  if (typeof version !== "string" || !VERSION.test(version)) {
    return { ok: false, message: "Manifest pembaruan: versi tidak valid." };
  }
  if (typeof minNativeVersion !== "string" || !VERSION.test(minNativeVersion)) {
    return { ok: false, message: "Manifest pembaruan: minNativeVersion tidak valid." };
  }
  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return { ok: false, message: "Manifest pembaruan: schemaVersion tidak valid." };
  }
  if (typeof sha256 !== "string" || !SHA256_HEX.test(sha256)) {
    return { ok: false, message: "Manifest pembaruan: sha256 tidak valid." };
  }
  return {
    ok: true,
    manifest: { version, minNativeVersion, schemaVersion, sha256: sha256.toLowerCase() },
  };
}

export interface CompatibilityInput {
  /** Highest database schema version the installed native bundle can migrate to. */
  supportedSchemaVersion: number;
  /** Installed APK version. */
  nativeVersion: string;
  /** Version of the currently active bundle. */
  currentVersion: string;
}

export type UpdateDecision =
  | { kind: "update"; version: string }
  | { kind: "up-to-date"; message: string }
  | { kind: "reject"; message: string };

/** Decides before download whether a manifest may be applied (Requirement 26.6). */
export function evaluateManifest(manifest: OtaManifest, ctx: CompatibilityInput): UpdateDecision {
  const needsNewerApk =
    manifest.schemaVersion > ctx.supportedSchemaVersion ||
    isNewerVersion(manifest.minNativeVersion, ctx.nativeVersion);
  if (needsNewerApk) {
    return {
      kind: "reject",
      message: `Pembaruan ditolak: pasang APK versi minimal ${manifest.minNativeVersion.replace(/^v/, "")} terlebih dahulu.`,
    };
  }
  if (!isNewerVersion(manifest.version, ctx.currentVersion)) {
    return { kind: "up-to-date", message: `Aplikasi sudah versi terbaru (v${ctx.currentVersion.replace(/^v/, "")}).` };
  }
  return { kind: "update", version: manifest.version.replace(/^v/, "") };
}

/** Extracts the hash from a `.sha256` file (`<hex>` or `<hex>  <name>`). Null if absent or malformed. */
export function parseSha256File(text: string | null | undefined): string | null {
  if (!text) return null;
  const token = text.trim().split(/\s+/)[0] ?? "";
  return SHA256_HEX.test(token) ? token.toLowerCase() : null;
}

export type ChecksumResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "mismatch"; message: string };

/** Compares the computed package hash with the release `.sha256` content (Requirements 26.4, 26.9). */
export function verifyChecksum(actualHex: string, sha256FileText: string | null | undefined): ChecksumResult {
  const expected = parseSha256File(sha256FileText);
  const message = "Pembaruan gagal diverifikasi.";
  if (!expected) return { ok: false, reason: "missing", message };
  if (actualHex.trim().toLowerCase() !== expected) return { ok: false, reason: "mismatch", message };
  return { ok: true };
}

export interface CheckScheduleInput {
  /** Setting `pembaruan.otomatis`. */
  autoEnabled: boolean;
  /** Setting `pembaruan.interval_jam` (1..168, default 24). */
  intervalHours: number;
  /** Epoch ms of the last check, or null if never. */
  lastCheckAtMs: number | null;
  nowMs: number;
  /** True when the owner pressed "Periksa Pembaruan". */
  manual?: boolean;
}

export const DEFAULT_INTERVAL_HOURS = 24;
const HOUR_MS = 3_600_000;

function clampInterval(hours: number): number {
  if (!Number.isFinite(hours)) return DEFAULT_INTERVAL_HOURS;
  return Math.min(168, Math.max(1, Math.floor(hours)));
}

/** True when an update check should run now (Requirements 26.7, 26.10). */
export function shouldCheckForUpdate(input: CheckScheduleInput): boolean {
  if (input.manual) return true;
  if (!input.autoEnabled) return false;
  const last = input.lastCheckAtMs;
  if (last === null || last <= 0 || input.nowMs < last) return true;
  return input.nowMs - last >= clampInterval(input.intervalHours) * HOUR_MS;
}
