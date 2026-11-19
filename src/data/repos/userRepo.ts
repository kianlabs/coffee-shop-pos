import { isRole } from "@/domain/permissions";
import { nameKey } from "@/domain/validationResult";
import type { AuthTx, AuthUnitOfWork, PinHasher, UserRecord, UserStore } from "@/services/ports/users";
import type { DbPort } from "../dbPort";
import { hashPin, verifyPin } from "../pinHash";
import { withPortTransaction, writeInTx } from "../tx";
import { createAuditRepo, createSettingsRepo } from "./settingsRepo";
const COLUMNS = "id, display_name, role, pin_hash, is_active, failed_attempts, locked_until, locked_at, created_at, updated_at";
const INSERT = `INSERT INTO users (id, display_name, display_name_ci, role, pin_hash, is_active, failed_attempts, locked_until, locked_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const UPDATE = `UPDATE users SET display_name = ?, display_name_ci = ?, role = ?, pin_hash = ?, is_active = ?, failed_attempts = ?,
  locked_until = ?, locked_at = ?, updated_at = ? WHERE id = ?`;
type Row = {
  id: string;
  display_name: string;
  role: string;
  pin_hash: string;
  is_active: number;
  failed_attempts: number;
  locked_until: number | null;
  locked_at: number | null;
  created_at: string;
  updated_at: string;
};
function toRecord(row: Row): UserRecord {
  if (!isRole(row.role)) throw new Error(`Peran tidak dikenal di users: ${row.role}`);
  return {
    id: row.id, displayName: row.display_name, role: row.role, pinHash: row.pin_hash, isActive: row.is_active === 1,
    failedAttempts: row.failed_attempts, lockedAt: row.locked_at, lockedUntil: row.locked_until,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
/** UserStore over the V9 `users` table. The unique index on active `display_name_ci` enforces name uniqueness. */
export function createUserRepo(db: DbPort): UserStore {
  return {
    async get(id) {
      const rows = await db.query<Row>(`SELECT ${COLUMNS} FROM users WHERE id = ?`, [id]);
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async list() {
      const rows = await db.query<Row>(`SELECT ${COLUMNS} FROM users ORDER BY created_at, id`);
      return rows.map(toRecord);
    },
    insert: (u) =>
      writeInTx(db, INSERT, [
        u.id, u.displayName, nameKey(u.displayName), u.role, u.pinHash, u.isActive ? 1 : 0, u.failedAttempts,
        u.lockedUntil, u.lockedAt, u.createdAt, u.updatedAt,
      ]),
    async update(u) {
      await writeInTx(db, UPDATE, [
        u.displayName, nameKey(u.displayName), u.role, u.pinHash, u.isActive ? 1 : 0, u.failedAttempts,
        u.lockedUntil, u.lockedAt, u.updatedAt, u.id,
      ]);
    },
  };
}
/** One serialized SQLite transaction exposing settings, audit, and users stores. */
export function createAuthUnitOfWork(db: DbPort): AuthUnitOfWork {
  const tx: AuthTx = { settings: createSettingsRepo(db), audit: createAuditRepo(db), users: createUserRepo(db) };
  return { transact: (fn) => withPortTransaction(db, () => fn(tx)) };
}
/** PBKDF2 hasher for production wiring. */
export function createPinHasher(iterations?: number): PinHasher {
  return { hash: (pin) => hashPin(pin, iterations), verify: verifyPin };
}
