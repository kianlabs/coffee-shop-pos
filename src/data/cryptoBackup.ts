/**
 * Backup terenkripsi client-side via WebCrypto AES-GCM + PBKDF2.
 * Path plaintext lama TIDAK dihapus — format terdeteksi otomatis di App.
 *
 * Format envelope: { format: 'pos-enc-v1', salt, iv, data } (base64).
 * - salt: 16 byte random, iv: 12 byte random, PBKDF2 100k SHA-256 -> AES-GCM 256.
 * - `data` adalah ciphertext dari UTF-8 JSON plaintext.
 *
 * DEFAULT (mudah diganti): PBKDF2_ITERATIONS = 100_000, di bawah.
 */

export const ENC_BACKUP_FORMAT = "pos-enc-v1";
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export type EncryptedBackup = {
  format: typeof ENC_BACKUP_FORMAT;
  salt: string;
  iv: string;
  data: string;
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

function getSubtle(): SubtleCrypto {
  const c = globalThis.crypto?.subtle;
  if (!c) throw new Error("WebCrypto tidak tersedia di browser ini.");
  return c;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtle();
  const base = await subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Enkripsi JSON plaintext menjadi envelope JSON string siap unduh. */
export async function encryptJson(plainJson: string, passphrase: string): Promise<string> {
  if (!passphrase) throw new Error("Passphrase tidak boleh kosong.");
  const subtle = getSubtle();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plainJson),
  );
  const env: EncryptedBackup = {
    format: ENC_BACKUP_FORMAT,
    salt: b64encode(salt),
    iv: b64encode(iv),
    data: b64encode(new Uint8Array(ct)),
  };
  return JSON.stringify(env);
}

/** Dekripsi envelope kembali ke JSON plaintext. Throw bila passphrase salah. */
export async function decryptJson(envelopeJson: string, passphrase: string): Promise<string> {
  if (!passphrase) throw new Error("Passphrase tidak boleh kosong.");
  let env: unknown;
  try {
    env = JSON.parse(envelopeJson);
  } catch {
    throw new Error("File backup terenkripsi tidak valid.");
  }
  const e = env as Partial<EncryptedBackup>;
  if (e.format !== ENC_BACKUP_FORMAT || !e.salt || !e.iv || !e.data) {
    throw new Error("Format backup tidak dikenali sebagai terenkripsi.");
  }
  const subtle = getSubtle();
  const key = await deriveKey(passphrase, b64decode(e.salt));
  let pt: ArrayBuffer;
  try {
    pt = await subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(e.iv) as BufferSource },
      key,
      b64decode(e.data) as BufferSource,
    );
  } catch {
    throw new Error("Passphrase salah atau file rusak.");
  }
  return new TextDecoder().decode(pt);
}

/** Deteksi apakah isi file adalah backup terenkripsi (vs plaintext schemaVersion). */
export function isEncryptedBackup(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as Record<string, unknown>).format === ENC_BACKUP_FORMAT
    );
  } catch {
    return false;
  }
}
