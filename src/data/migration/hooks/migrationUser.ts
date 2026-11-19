import type { DbPort } from "@/data/dbPort";
/** Inactive placeholder owner of rows imported when no real user exists yet (onboarding creates the real owner). */
export const PLACEHOLDER_USER_ID = "user-migrasi";
const INSERT_PLACEHOLDER = `INSERT OR IGNORE INTO users
  (id, display_name, display_name_ci, role, pin_hash, is_active, created_at, updated_at)
  VALUES (?, 'Migrasi', 'migrasi', 'kasir', '!', 0, ?, ?)`;
/** Id of the active owner, or of the inactive placeholder user (created on demand) when there is none. */
export async function migrationUserId(db: DbPort, now: string): Promise<string> {
  const owners = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE role = 'owner' AND is_active = 1 ORDER BY created_at, id LIMIT 1",
  );
  if (owners[0]) return owners[0].id;
  await db.run(INSERT_PLACEHOLDER, [PLACEHOLDER_USER_ID, now, now]);
  return PLACEHOLDER_USER_ID;
}
/** Id of the active owner, or null when there is none. */
export async function ownerId(db: DbPort): Promise<string | null> {
  const owners = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE role = 'owner' AND is_active = 1 ORDER BY created_at, id LIMIT 1",
  );
  return owners[0]?.id ?? null;
}
