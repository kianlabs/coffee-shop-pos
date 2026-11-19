import { VOID_PIN_ITERATIONS } from "./settings";

/** Format: pbkdf2$sha256$<iter>$<salt_b64>$<hash_b64>. */
const PREFIX = "pbkdf2$sha256$";
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const MAX_ITERATIONS = 10_000_000;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export const PIN_HASH_ITERATIONS = VOID_PIN_ITERATIONS;

interface Parsed {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(value: string): Uint8Array | null {
  if (!B64_RE.test(value)) return null;
  try {
    const bin = atob(value);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto tidak tersedia di browser ini.");
  return subtle;
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const subtle = getSubtle();
  const key = await subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Compares full length without early exit on content. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function parse(stored: string): Parsed | null {
  const parts = stored.split("$");
  if (parts.length !== 5 || `${parts[0]}$${parts[1]}$` !== PREFIX) return null;
  if (!/^[1-9][0-9]*$/.test(parts[2])) return null;
  const iterations = Number(parts[2]);
  if (!Number.isSafeInteger(iterations) || iterations > MAX_ITERATIONS) return null;
  const salt = fromB64(parts[3]);
  const hash = fromB64(parts[4]);
  if (!salt || !hash || salt.length !== SALT_BYTES || hash.length !== HASH_BYTES) return null;
  return { iterations, salt, hash };
}

/** Hashes a PIN with a fresh 16-byte salt. `iterations` is stored inside the result. */
export async function hashPin(pin: string, iterations: number = PIN_HASH_ITERATIONS): Promise<string> {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) {
    throw new RangeError("Jumlah iterasi hash PIN tidak valid.");
  }
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(pin, salt, iterations);
  return `${PREFIX}${iterations}$${toB64(salt)}$${toB64(hash)}`;
}

/** Verifies a PIN against a stored hash string. Malformed input returns false. */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  if (!pin) return false;
  const parsed = parse(stored);
  if (!parsed) return false;
  try {
    const actual = await derive(pin, parsed.salt, parsed.iterations);
    return equalBytes(actual, parsed.hash);
  } catch {
    return false;
  }
}

/**
 * Wraps an existing void PIN hash and salt (from `hashVoidPin`) in the new format.
 * No re-hash: the derivation is identical (PBKDF2-SHA256, 600k iterations, 32 bytes).
 * Returns null when either value is not valid.
 */
export function fromLegacyVoidPin(hashB64: string, saltB64: string): string | null {
  const stored = `${PREFIX}${VOID_PIN_ITERATIONS}$${saltB64}$${hashB64}`;
  return parse(stored) ? stored : null;
}
