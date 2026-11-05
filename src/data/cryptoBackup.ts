/**
 * Backup terenkripsi client-side via WebCrypto AES-GCM + PBKDF2.
 * Path plaintext lama TIDAK dihapus — format terdeteksi otomatis di App.
 *
 * Format aktif (pos-enc-v2), semua field header ikut menentukan kunci/verifikasi:
 * {
 *   format: "pos-enc-v2",
 *   kdf: "PBKDF2-SHA256", iterations: 600000,
 *   cipher: "AES-GCM-256",
 *   salt: <base64 16 byte acak>, iv: <base64 12 byte acak>,
 *   checksum: <hex SHA-256 dari plaintext JSON>,
 *   appVersion, schemaVersion, createdAt,
 *   data: <base64 ciphertext>
 * }
 * - `iterations` dibaca dari header saat dekripsi, jadi backup lama tetap bisa
 *   dibuka walau default dinaikkan.
 * - Format lama `pos-enc-v1` (tanpa iterations/checksum/metadata) masih dibaca
 *   dengan asumsi PBKDF2 100k + SHA-256.
 *
 * Catatan: checksum adalah integritas tambahan di lapisan aplikasi; AES-GCM
 * sendiri sudah menolak ciphertext yang diubah (auth tag).
 */

export const ENC_BACKUP_FORMAT = "pos-enc-v2";
export const ENC_BACKUP_FORMAT_V1 = "pos-enc-v1";

/** OWASP 2023 untuk PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;
/** Iterasi format v1 (tanpa field `iterations` di header). */
export const PBKDF2_ITERATIONS_V1 = 100_000;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const MIN_ITERATIONS = 10_000;
const MAX_ITERATIONS = 5_000_000;

/** Samakan dengan "version" di package.json saat rilis. */
export const APP_VERSION = "1.0.0";

export type EncryptedBackup = {
  format: typeof ENC_BACKUP_FORMAT;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  cipher: "AES-GCM-256";
  salt: string;
  iv: string;
  checksum: string;
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  data: string;
};

export type EncryptOptions = {
  appVersion?: string;
  schemaVersion?: number;
};

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getSubtle(): SubtleCrypto {
  const c = globalThis.crypto?.subtle;
  if (!c) throw new Error("WebCrypto tidak tersedia di browser ini.");
  return c;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await getSubtle().digest("SHA-256", new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const base = await subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Ambil schemaVersion dari plaintext bila ada (dipakai sebagai metadata header). */
function detectSchemaVersion(plainJson: string): number {
  try {
    const parsed: unknown = JSON.parse(plainJson);
    if (typeof parsed === "object" && parsed !== null) {
      const v = (parsed as Record<string, unknown>).schemaVersion;
      if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
    }
  } catch {
    // Plaintext tidak wajib JSON yang valid di level ini.
  }
  return 1;
}

/** Enkripsi JSON plaintext menjadi envelope JSON string siap unduh. */
export async function encryptJson(
  plainJson: string,
  passphrase: string,
  opts: EncryptOptions = {},
): Promise<string> {
  if (!passphrase) throw new Error("Passphrase tidak boleh kosong.");
  const subtle = getSubtle();
  // Salt & IV baru untuk SETIAP enkripsi (jangan pernah dipakai ulang).
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES) {
    throw new Error("Gagal membuat salt/IV acak.");
  }
  const checksum = await sha256Hex(plainJson);
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plainJson),
  );
  const env: EncryptedBackup = {
    format: ENC_BACKUP_FORMAT,
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    cipher: "AES-GCM-256",
    salt: b64encode(salt),
    iv: b64encode(iv),
    checksum,
    appVersion: opts.appVersion ?? APP_VERSION,
    schemaVersion: opts.schemaVersion ?? detectSchemaVersion(plainJson),
    createdAt: new Date().toISOString(),
    data: b64encode(new Uint8Array(ct)),
  };
  return JSON.stringify(env);
}

type ParsedHeader = {
  format: string;
  iterations: number;
  salt: Uint8Array;
  iv: Uint8Array;
  data: Uint8Array;
  checksum: string | null;
};

function parseHeader(envelopeJson: string): ParsedHeader {
  let env: unknown;
  try {
    env = JSON.parse(envelopeJson);
  } catch {
    throw new Error("File backup terenkripsi tidak valid.");
  }
  if (typeof env !== "object" || env === null) {
    throw new Error("File backup terenkripsi tidak valid.");
  }
  const e = env as Record<string, unknown>;
  const format = typeof e.format === "string" ? e.format : "";
  if (format !== ENC_BACKUP_FORMAT && format !== ENC_BACKUP_FORMAT_V1) {
    throw new Error("Format backup tidak dikenali sebagai terenkripsi.");
  }
  if (typeof e.salt !== "string" || typeof e.iv !== "string" || typeof e.data !== "string") {
    throw new Error("Header backup terenkripsi tidak lengkap.");
  }
  let iterations = PBKDF2_ITERATIONS_V1;
  if (format === ENC_BACKUP_FORMAT) {
    if (typeof e.iterations !== "number" || !Number.isInteger(e.iterations)) {
      throw new Error("Header backup tidak memuat parameter iterasi.");
    }
    if (e.iterations < MIN_ITERATIONS || e.iterations > MAX_ITERATIONS) {
      throw new Error("Parameter iterasi backup di luar batas aman.");
    }
    iterations = e.iterations;
  }
  let salt: Uint8Array;
  let iv: Uint8Array;
  let data: Uint8Array;
  try {
    salt = b64decode(e.salt);
    iv = b64decode(e.iv);
    data = b64decode(e.data);
  } catch {
    throw new Error("Encoding base64 backup rusak.");
  }
  if (salt.length !== SALT_BYTES) throw new Error("Panjang salt backup tidak valid (harus 16 byte).");
  if (iv.length !== IV_BYTES) throw new Error("Panjang IV backup tidak valid (harus 12 byte).");
  if (data.length === 0) throw new Error("Ciphertext backup kosong.");
  const checksum =
    format === ENC_BACKUP_FORMAT && typeof e.checksum === "string" && /^[0-9a-f]{64}$/i.test(e.checksum)
      ? e.checksum.toLowerCase()
      : null;
  if (format === ENC_BACKUP_FORMAT && !checksum) {
    throw new Error("Header backup tidak memuat checksum SHA-256.");
  }
  return { format, iterations, salt, iv, data, checksum };
}

/** Dekripsi envelope kembali ke JSON plaintext. Throw bila passphrase salah/rusak. */
export async function decryptJson(envelopeJson: string, passphrase: string): Promise<string> {
  if (!passphrase) throw new Error("Passphrase tidak boleh kosong.");
  const h = parseHeader(envelopeJson);
  const subtle = getSubtle();
  const key = await deriveKey(passphrase, h.salt, h.iterations);
  let pt: ArrayBuffer;
  try {
    pt = await subtle.decrypt(
      { name: "AES-GCM", iv: h.iv as BufferSource },
      key,
      h.data as BufferSource,
    );
  } catch {
    throw new Error("Passphrase salah atau file rusak.");
  }
  const text = new TextDecoder().decode(pt);
  if (h.checksum) {
    const actual = await sha256Hex(text);
    if (actual !== h.checksum) {
      throw new Error("Checksum backup tidak cocok — file rusak atau dimanipulasi.");
    }
  }
  return text;
}

/** Deteksi apakah isi file adalah backup terenkripsi (vs plaintext schemaVersion). */
export function isEncryptedBackup(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return false;
    const format = (parsed as Record<string, unknown>).format;
    return format === ENC_BACKUP_FORMAT || format === ENC_BACKUP_FORMAT_V1;
  } catch {
    return false;
  }
}
