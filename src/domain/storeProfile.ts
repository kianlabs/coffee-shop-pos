/**
 * Store_Profile: identitas toko (nama, alamat, NPWP, logo, header/footer struk).
 * Modul murni tanpa dependensi React/SQLite/Capacitor. Persistensi ada di
 * `src/data/storeProfile.ts`.
 */

export interface StoreProfile {
  name: string;
  address: string;
  npwp: string;
  /** PNG data URL (`data:image/png;base64,...`) atau kosong = logo bawaan. */
  logoB64: string;
  receiptHeader: string;
  receiptFooter: string;
}

export type StoreProfileField = keyof StoreProfile;

/** Nilai awal netral: tidak memuat identitas toko tertentu. */
export const DEFAULT_STORE_PROFILE: StoreProfile = {
  name: "Nama Toko",
  address: "",
  npwp: "",
  logoB64: "",
  receiptHeader: "",
  receiptFooter: "",
};

/** Kunci di tabel `app_settings` untuk tiap field. */
export const STORE_PROFILE_KEYS: Record<StoreProfileField, string> = {
  name: "toko.nama",
  address: "toko.alamat",
  npwp: "toko.npwp",
  logoB64: "toko.logo_b64",
  receiptHeader: "struk.header",
  receiptFooter: "struk.footer",
};

export const STORE_PROFILE_LIMITS: Record<StoreProfileField, number> = {
  name: 100,
  address: 200,
  npwp: 32,
  logoB64: 400_000,
  receiptHeader: 200,
  receiptFooter: 200,
};

export interface SettingRow {
  key: string;
  value: string;
}

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/;

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") {
    return "";
  }
  const stripped = value.replace(CONTROL_CHARS, "").trim();
  return Array.from(stripped).slice(0, max).join("");
}

function cleanLogo(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const max = STORE_PROFILE_LIMITS.logoB64;
  if (value.length > max || !PNG_DATA_URL.test(value)) {
    return "";
  }
  return value;
}

/**
 * Bersihkan masukan apa pun menjadi StoreProfile yang valid:
 * karakter kontrol dibuang, panjang dibatasi, nama kosong kembali ke default,
 * logo yang bukan PNG data URL atau terlalu besar dikosongkan.
 */
export function sanitizeStoreProfile(
  raw: Partial<Record<StoreProfileField, unknown>>,
): StoreProfile {
  const name = cleanText(raw.name, STORE_PROFILE_LIMITS.name);
  return {
    name: name === "" ? DEFAULT_STORE_PROFILE.name : name,
    address: cleanText(raw.address, STORE_PROFILE_LIMITS.address),
    npwp: cleanText(raw.npwp, STORE_PROFILE_LIMITS.npwp),
    logoB64: cleanLogo(raw.logoB64),
    receiptHeader: cleanText(raw.receiptHeader, STORE_PROFILE_LIMITS.receiptHeader),
    receiptFooter: cleanText(raw.receiptFooter, STORE_PROFILE_LIMITS.receiptFooter),
  };
}

export function profileToRows(profile: StoreProfile): SettingRow[] {
  const clean = sanitizeStoreProfile(profile);
  const fields = Object.keys(STORE_PROFILE_KEYS) as StoreProfileField[];
  return fields.map((field) => ({ key: STORE_PROFILE_KEYS[field], value: clean[field] }));
}

/** Baris tidak dikenal diabaikan; field yang tidak ada memakai nilai awal. */
export function profileFromRows(rows: readonly SettingRow[]): StoreProfile {
  const raw: Partial<Record<StoreProfileField, unknown>> = {};
  const fields = Object.keys(STORE_PROFILE_KEYS) as StoreProfileField[];
  for (const field of fields) {
    const row = rows.find((r) => r.key === STORE_PROFILE_KEYS[field]);
    if (row) {
      raw[field] = row.value;
    }
  }
  return sanitizeStoreProfile(raw);
}

/** Kunci yang dibaca saat memuat profil. */
export function storeProfileKeys(): string[] {
  return Object.values(STORE_PROFILE_KEYS);
}
