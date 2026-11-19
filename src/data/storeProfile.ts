import {
  DEFAULT_STORE_PROFILE,
  profileFromRows,
  profileToRows,
  sanitizeStoreProfile,
  STORE_PROFILE_KEYS,
  type SettingRow,
  type StoreProfile,
} from "../domain/storeProfile";
import { getDb, isNativePlatform } from "./db";
import { getSettings } from "./settings";
import { execStatements, runSerializedWrite, withTransaction, type SqlStatement } from "./tx";

export const STORE_PROFILE_SELECT = "SELECT key AS key, value AS value FROM app_settings;";
const UPSERT =
  "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?);";

/** Backend web (dev, demo, e2e): sama seperti repositori lain, SQLite hanya di native. */
export const STORE_PROFILE_LOCAL_KEY = "pos.store-profile.v1";

const native = isNativePlatform();

function toSettingRows(values: unknown): SettingRow[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const rows: SettingRow[] = [];
  for (const item of values) {
    const row = item as { key?: unknown; value?: unknown };
    if (typeof row.key === "string" && typeof row.value === "string") {
      rows.push({ key: row.key, value: row.value });
    }
  }
  return rows;
}

/**
 * Profil dari pengaturan lama (`pos.settings.v1`) untuk toko yang sudah
 * memakai aplikasi sebelum Store_Profile ada. Nama bawaan lama tidak dibawa.
 */
export function getLegacyStoreProfile(): StoreProfile {
  const legacy = getSettings();
  return sanitizeStoreProfile({
    name: legacy.storeName,
    logoB64: legacy.logoBase64,
  });
}

/** Pengaturan lama bila ada isinya, selain itu nilai awal netral. */
function legacyOrDefault(): StoreProfile {
  const legacy = getLegacyStoreProfile();
  return legacy.name === DEFAULT_STORE_PROFILE.name && legacy.logoB64 === ""
    ? { ...DEFAULT_STORE_PROFILE }
    : legacy;
}

function loadLocal(): StoreProfile | null {
  try {
    const raw = localStorage.getItem(STORE_PROFILE_LOCAL_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    return sanitizeStoreProfile(parsed as Partial<Record<keyof StoreProfile, unknown>>);
  } catch {
    return null;
  }
}

/** Baca Store_Profile; tanpa data tersimpan, pakai pengaturan lama lalu nilai awal netral. */
export async function loadStoreProfile(): Promise<StoreProfile> {
  if (!native) {
    return loadLocal() ?? legacyOrDefault();
  }
  const db = await getDb();
  const res = await db.query(STORE_PROFILE_SELECT);
  const rows = toSettingRows(res.values);
  const hasStoredName = rows.some((r) => r.key === STORE_PROFILE_KEYS.name);
  return hasStoredName ? profileFromRows(rows) : legacyOrDefault();
}

/** Upsert statements for every profile key; values are JSON-encoded like `SettingsRepo`. */
export function storeProfileStatements(profile: StoreProfile, nowIso: string): SqlStatement[] {
  return profileToRows(profile).map((row) => ({
    statement: UPSERT,
    values: [row.key, row.value, nowIso],
  }));
}
/** Simpan Store_Profile (satu transaksi di SQLite) dan kembalikan nilai yang sudah dibersihkan. */
export async function saveStoreProfile(next: StoreProfile): Promise<StoreProfile> {
  const clean = sanitizeStoreProfile(next);
  if (!native) {
    localStorage.setItem(STORE_PROFILE_LOCAL_KEY, JSON.stringify(clean));
    return clean;
  }
  const now = new Date().toISOString();
  const statements = storeProfileStatements(clean, now);
  const db = await getDb();
  await runSerializedWrite(() =>
    withTransaction(db, () => execStatements(db, statements)),
  );
  return clean;
}
