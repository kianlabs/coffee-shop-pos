import {
  DEFAULT_STORE_PROFILE,
  profileFromRows,
  profileToRows,
  sanitizeStoreProfile,
  STORE_PROFILE_KEYS,
  type SettingRow,
  type StoreProfile,
} from "../domain/storeProfile";
import { getDb } from "./db";
import { getSettings } from "./settings";
import { execStatements, runSerializedWrite, withTransaction, type SqlStatement } from "./tx";

const SELECT_ALL = "SELECT key AS key, value AS value FROM app_settings;";
const UPSERT =
  "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?);";

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
function legacyProfile(): StoreProfile {
  const legacy = getSettings();
  return sanitizeStoreProfile({
    name: legacy.storeName,
    logoB64: legacy.logoBase64,
  });
}

/** Baca Store_Profile dari SQLite; tanpa data tersimpan, pakai pengaturan lama lalu nilai awal netral. */
export async function loadStoreProfile(): Promise<StoreProfile> {
  const db = await getDb();
  const res = await db.query(SELECT_ALL);
  const rows = toSettingRows(res.values);
  const hasStoredName = rows.some((r) => r.key === STORE_PROFILE_KEYS.name);
  if (hasStoredName) {
    return profileFromRows(rows);
  }
  const legacy = legacyProfile();
  return legacy.name === DEFAULT_STORE_PROFILE.name && legacy.logoB64 === ""
    ? { ...DEFAULT_STORE_PROFILE }
    : legacy;
}

/** Simpan Store_Profile dalam satu transaksi dan kembalikan nilai yang sudah dibersihkan. */
export async function saveStoreProfile(next: StoreProfile): Promise<StoreProfile> {
  const clean = sanitizeStoreProfile(next);
  const now = new Date().toISOString();
  const statements: SqlStatement[] = profileToRows(clean).map((row) => ({
    statement: UPSERT,
    values: [row.key, row.value, now],
  }));
  const db = await getDb();
  await runSerializedWrite(() =>
    withTransaction(db, () => execStatements(db, statements)),
  );
  return clean;
}
