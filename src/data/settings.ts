export type RoundingStep = 0 | 100 | 500 | 1000;

export type PosSettings = {
  serviceChargeRp: number;
  roundingStep: RoundingStep;
  requireVoidPin: boolean;
  voidPin: string;
  cashierName: string;
  storeName: string;
};

/** DEFAULT: semua nilai aman — tanpa biaya tambahan, tanpa pembulatan, tanpa PIN. */
export const DEFAULT_SETTINGS: PosSettings = {
  serviceChargeRp: 0,
  roundingStep: 0,
  requireVoidPin: false,
  voidPin: "",
  cashierName: "",
  storeName: "KOPI POS",
};

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

function sanitize(raw: Partial<PosSettings>): PosSettings {
  const serviceChargeRp = Math.max(0, toInt(raw.serviceChargeRp, DEFAULT_SETTINGS.serviceChargeRp));
  const stepRaw = toInt(raw.roundingStep, DEFAULT_SETTINGS.roundingStep);
  const roundingStep = (VALID_STEPS.includes(stepRaw) ? stepRaw : 0) as RoundingStep;
  const requireVoidPin = raw.requireVoidPin === true;
  // PIN disimpan apa adanya (string); validasi panjang dilakukan saat simpan via UI.
  const voidPin = toString(raw.voidPin, "").slice(0, 32);
  const cashierName = toString(raw.cashierName, "").slice(0, 100);
  const storeRaw = toString(raw.storeName, DEFAULT_SETTINGS.storeName).slice(0, 100);
  const storeName = storeRaw.trim() === "" ? DEFAULT_SETTINGS.storeName : storeRaw;
  return { serviceChargeRp, roundingStep, requireVoidPin, voidPin, cashierName, storeName };
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
    return sanitize(parsed as Partial<PosSettings>);
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
  return { rounded, roundingRp: rounded - total };
}
