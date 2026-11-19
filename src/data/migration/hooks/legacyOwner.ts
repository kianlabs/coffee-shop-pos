import type { DataHook } from "@/data/migration/runner";
import type { HookInputs } from "./inputs";
export const LEGACY_OWNER_ID = "user-owner-legacy";
const HASH_BYTES = 32;
const SALT_BYTES = 16;
/** Iteration count of the old PIN hash (`VOID_PIN_ITERATIONS` in settings.ts). */
const LEGACY_ITERATIONS = 600_000;
function base64Length(value: unknown): number | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}
/** Builds `pbkdf2$sha256$iter$salt$hash` from the old fields, or null when they are missing or malformed. */
export function legacyPinHash(settingsJson: string | null): string | null {
  if (settingsJson === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(settingsJson);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { voidPinHash, voidPinSalt } = parsed as Record<string, unknown>;
  if (base64Length(voidPinHash) !== HASH_BYTES || base64Length(voidPinSalt) !== SALT_BYTES) return null;
  return `pbkdf2$sha256$${LEGACY_ITERATIONS}$${String(voidPinSalt)}$${String(voidPinHash)}`;
}
/** Old supervisor PIN becomes the single owner "Owner"; the hash is carried over, not re-hashed. */
export function createLegacyOwnerHook(inputs: HookInputs): DataHook {
  return async (db) => {
    const existing = await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM users");
    if (existing[0] && existing[0].n > 0) return;
    const pinHash = legacyPinHash(inputs.legacy.settings);
    if (pinHash === null) {
      inputs.log?.("Tidak ada PIN supervisor lama; pemilik dibuat saat onboarding.");
      return;
    }
    const now = inputs.now();
    await db.run(
      `INSERT OR IGNORE INTO users (id, display_name, display_name_ci, role, pin_hash, created_at, updated_at)
       VALUES (?, 'Owner', 'owner', 'owner', ?, ?, ?)`,
      [LEGACY_OWNER_ID, pinHash, now, now],
    );
  };
}
