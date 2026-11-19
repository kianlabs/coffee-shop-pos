import { fromLegacyVoidPin } from "@/data/pinHash";
import type { DataHook } from "@/data/migration/runner";
import type { HookInputs } from "./inputs";
export const LEGACY_OWNER_ID = "user-owner-legacy";
/** Builds the new PIN hash from the old `voidPinHash`/`voidPinSalt` fields, or null when missing or malformed. */
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
  if (typeof voidPinHash !== "string" || typeof voidPinSalt !== "string") return null;
  return fromLegacyVoidPin(voidPinHash, voidPinSalt);
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
