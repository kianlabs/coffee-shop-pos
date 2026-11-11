export type RoundingStep = 0 | 100 | 500 | 1000;

export type PosSettings = {
  serviceChargeRp: number;
  roundingStep: RoundingStep;
  requireVoidPin: boolean;
  /** PBKDF2-SHA256 hash PIN void (base64). Plaintext PIN tidak pernah disimpan. */
  voidPinHash: string;
  /** Salt acak 16 byte untuk hash PIN (base64). */
  voidPinSalt: string;
  cashierName: string;
  storeName: string;
  /** true = checkout ditolak bila stok bahan tidak cukup (default: tetap jalan). */
  blockNegativeStock: boolean;
  /** true = struk langsung dicetak setelah transaksi tersimpan. */
  autoPrint: boolean;
  /** true = cetak logo di bagian atas struk thermal / struk web. */
  printLogo: boolean;
  /** PNG base64 untuk logo struk (kosong = pakai logo default assets/logo.png). */
  logoBase64: string;
  /** true = tampilkan papan angka sentuh (touch numpad) kasir saat bayar tunai (default: true). */
  showCashNumpad: boolean;
};

/** DEFAULT: semua nilai aman — tanpa biaya tambahan, tanpa pembulatan, tanpa PIN. */
export const DEFAULT_SETTINGS: PosSettings = {
  serviceChargeRp: 0,
  roundingStep: 0,
  requireVoidPin: false,
  voidPinHash: "",
  voidPinSalt: "",
  cashierName: "",
  storeName: "RAHARDJO COFFEE",
  blockNegativeStock: false,
  autoPrint: true,
  printLogo: true,
  logoBase64: "",
  showCashNumpad: true,
};

/** OWASP 2023 untuk PBKDF2-HMAC-SHA256 (sama dengan backup terenkripsi). */
export const VOID_PIN_ITERATIONS = 600_000;
const VOID_PIN_HASH_BYTES = 32;
const VOID_PIN_SALT_BYTES = 16;

const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export const SETTINGS_KEY = "pos.settings.v1";

/** DEFAULT: daftar langkah pembulatan yang didukung UI (0 = tanpa pembulatan). */
export const ROUNDING_OPTIONS: readonly RoundingStep[] = [0, 100, 500, 1000];

const VALID_STEPS: readonly number[] = [0, 100, 500, 1000];

function toInt(n: unknown, fallback: number): number {
  return typeof n === "number" && Number.isInteger(n) ? n : fallback;
}

function toString(n: unknown, fallback: string): string {
  return typeof n === "string" ? n : fallback;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function validBase64(value: string, byteLength: number): boolean {
  if (value === "" || !B64_RE.test(value)) return false;
  try {
    return base64ToBytes(value).length === byteLength;
  } catch {
    return false;
  }
}

/**
 * Hash PIN void dengan PBKDF2-SHA256 + salt acak.
 * `salt` (base64) boleh diberikan untuk verifikasi; bila kosong dibuat baru.
 */
export async function hashVoidPin(
  pin: string,
  salt?: string,
): Promise<{ hash: string; salt: string }> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto tidak tersedia di browser ini.");
  let saltBytes: Uint8Array;
  if (salt) {
    saltBytes = base64ToBytes(salt);
    if (saltBytes.length !== VOID_PIN_SALT_BYTES) {
      throw new Error("Salt PIN tidak valid.");
    }
  } else {
    saltBytes = globalThis.crypto.getRandomValues(new Uint8Array(VOID_PIN_SALT_BYTES));
  }
  const key = await subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes as BufferSource,
      iterations: VOID_PIN_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    VOID_PIN_HASH_BYTES * 8,
  );
  return {
    hash: bytesToBase64(new Uint8Array(bits)),
    salt: bytesToBase64(saltBytes),
  };
}

/** Perbandingan byte constant-time-ish (selalu membaca seluruh panjang). */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Verifikasi PIN terhadap hash tersimpan. Tidak pernah membandingkan plaintext. */
export async function verifyVoidPin(pin: string, settings: PosSettings): Promise<boolean> {
  if (!pin || !settings.voidPinHash || !settings.voidPinSalt) return false;
  try {
    if (!validBase64(settings.voidPinHash, VOID_PIN_HASH_BYTES)) return false;
    if (!validBase64(settings.voidPinSalt, VOID_PIN_SALT_BYTES)) return false;
    const { hash } = await hashVoidPin(pin, settings.voidPinSalt);
    return equalBytes(base64ToBytes(hash), base64ToBytes(settings.voidPinHash));
  } catch {
    return false;
  }
}

function sanitize(raw: Partial<PosSettings> & Record<string, unknown>): PosSettings {
  const serviceChargeRp = Math.max(0, toInt(raw.serviceChargeRp, DEFAULT_SETTINGS.serviceChargeRp));
  const stepRaw = toInt(raw.roundingStep, DEFAULT_SETTINGS.roundingStep);
  const roundingStep = (VALID_STEPS.includes(stepRaw) ? stepRaw : 0) as RoundingStep;
  const requireVoidPin = raw.requireVoidPin === true;
  // Plaintext `voidPin` dari versi lama sengaja diabaikan di sini. Migrasi ke
  // hash dilakukan sekali oleh migrateLegacyVoidPin() saat app dibuka.
  const rawHash = toString(raw.voidPinHash, "");
  const rawSalt = toString(raw.voidPinSalt, "");
  const hasHash = validBase64(rawHash, VOID_PIN_HASH_BYTES);
  const hasSalt = validBase64(rawSalt, VOID_PIN_SALT_BYTES);
  const voidPinHash = hasHash && hasSalt ? rawHash : "";
  const voidPinSalt = hasHash && hasSalt ? rawSalt : "";
  const cashierName = toString(raw.cashierName, "").slice(0, 100);
  const storeRaw = toString(raw.storeName, DEFAULT_SETTINGS.storeName).slice(0, 100);
  const storeName = storeRaw.trim() === "" ? DEFAULT_SETTINGS.storeName : storeRaw;
  const blockNegativeStock = raw.blockNegativeStock === true;
  const autoPrint = raw.autoPrint !== false;
  const printLogo = raw.printLogo !== false;
  const logoBase64 = toString(raw.logoBase64, "");
  const showCashNumpad = raw.showCashNumpad !== false;
  return {
    serviceChargeRp,
    roundingStep,
    requireVoidPin,
    voidPinHash,
    voidPinSalt,
    cashierName,
    storeName,
    blockNegativeStock,
    autoPrint,
    printLogo,
    logoBase64,
    showCashNumpad,
  };
}

export function getSettings(): PosSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_SETTINGS };
    }
    return sanitize(parsed as Partial<PosSettings> & Record<string, unknown>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(next: PosSettings): PosSettings {
  const clean = sanitize(next);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean));
  } catch {
    // Kuota penuh / mode privat: pengaturan tetap dipakai sesi ini.
  }
  return clean;
}

/**
 * Migrasi sekali dari format lama yang menyimpan `voidPin` plaintext.
 * - Bila ada PIN plaintext dan belum ada hash, PIN di-hash (PBKDF2 + salt acak).
 * - Field `voidPin` selalu dibuang dari localStorage pada migrasi ini.
 * - Mengembalikan settings hasil migrasi, atau null bila tidak ada yang perlu
 *   dimigrasikan (atau migrasi gagal karena WebCrypto tidak tersedia).
 */
export async function migrateLegacyVoidPin(): Promise<PosSettings | null> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(obj, "voidPin")) return null;

    const legacyPin = typeof obj.voidPin === "string" ? obj.voidPin : "";
    let voidPinHash = typeof obj.voidPinHash === "string" ? obj.voidPinHash : "";
    let voidPinSalt = typeof obj.voidPinSalt === "string" ? obj.voidPinSalt : "";
    const alreadyHashed =
      validBase64(voidPinHash, VOID_PIN_HASH_BYTES) &&
      validBase64(voidPinSalt, VOID_PIN_SALT_BYTES);
    if (legacyPin !== "" && !alreadyHashed) {
      const hashed = await hashVoidPin(legacyPin);
      voidPinHash = hashed.hash;
      voidPinSalt = hashed.salt;
    }

    const clean = sanitize({ ...obj, voidPinHash, voidPinSalt });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean));
    } catch {
      // Gagal menulis: tetap kembalikan hasil bersih untuk sesi ini.
    }
    return clean;
  } catch {
    return null;
  }
}

export type RoundedTotal = {
  /** Total setelah pembulatan ke bawah (floor) sesuai step. */
  rounded: number;
  /** Selisih = rounded - total (<= 0; 0 bila tanpa pembulatan). */
  roundingRp: number;
};

/**
 * Bulatkan total ke bawah ke kelipatan step.
 * DEFAULT step 0 = tanpa pembulatan (kembali total utuh).
 */
export function applyRounding(totalRp: number, step: RoundingStep): RoundedTotal {
  const total = Number.isInteger(totalRp) && totalRp > 0 ? totalRp : Math.max(0, Math.trunc(totalRp) || 0);
  if (step === 0) {
    return { rounded: total, roundingRp: 0 };
  }
  const rounded = Math.floor(total / step) * step;
  // Jangan pernah membulatkan transaksi menjadi Rp0 (mis. total 800 dengan
  // step 1.000). Lebih baik tanpa pembulatan daripada struk gratis.
  if (rounded <= 0) {
    return { rounded: total, roundingRp: 0 };
  }
  return { rounded, roundingRp: rounded - total };
}

export const PIN_LOCKOUT_KEY = "pos.pin_lockout.v1";
export const MAX_PIN_ATTEMPTS = 3;
export const PIN_LOCKOUT_MS = 5 * 60 * 1000; // 5 menit

export type PinLockoutState = {
  attempts: number;
  lockedUntil: number | null;
};

export function getPinLockoutState(): PinLockoutState {
  try {
    const raw = localStorage.getItem(PIN_LOCKOUT_KEY);
    if (!raw) return { attempts: 0, lockedUntil: null };
    const parsed = JSON.parse(raw);
    const lockedUntil = typeof parsed?.lockedUntil === "number" ? parsed.lockedUntil : null;
    const attempts = typeof parsed?.attempts === "number" ? parsed.attempts : 0;
    if (lockedUntil && Date.now() >= lockedUntil) {
      clearPinLockout();
      return { attempts: 0, lockedUntil: null };
    }
    return { attempts, lockedUntil };
  } catch {
    return { attempts: 0, lockedUntil: null };
  }
}

export function recordPinFailure(): PinLockoutState {
  const current = getPinLockoutState();
  const nextAttempts = current.attempts + 1;
  const lockedUntil = nextAttempts >= MAX_PIN_ATTEMPTS ? Date.now() + PIN_LOCKOUT_MS : null;
  const state: PinLockoutState = { attempts: nextAttempts, lockedUntil };
  try {
    localStorage.setItem(PIN_LOCKOUT_KEY, JSON.stringify(state));
  } catch {
    // Abaikan kegagalan storage
  }
  return state;
}

export function clearPinLockout(): void {
  try {
    localStorage.removeItem(PIN_LOCKOUT_KEY);
  } catch {
    // Abaikan kegagalan storage
  }
}
