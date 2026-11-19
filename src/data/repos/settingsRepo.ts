import type { AuditStore, SettingsStore, StoredSetting } from "@/services/ports/settings";
import type { DbPort } from "../dbPort";
import { writeInTx } from "../tx";

const SELECT_ALL = "SELECT key, value FROM app_settings";
const UPSERT = `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`;
const DELETE = "DELETE FROM app_settings WHERE key = ?";
const INSERT_AUDIT = `INSERT INTO audit_logs
  (id, actor_id, approver_id, action, action_type, entity_type, entity_id, before_json, after_json, reason, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** Rows written before the registry hold plain text (for example struk.header); keep them as strings. */
function decode(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function encode(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

/** SettingsStore over `app_settings`. Values are stored as JSON text. */
export function createSettingsRepo(db: DbPort): SettingsStore {
  return {
    async loadAll(): Promise<StoredSetting[]> {
      const rows = await db.query<{ key: string; value: string }>(SELECT_ALL);
      return rows.map((r) => ({ key: r.key, value: decode(r.value) }));
    },
    put: (row) => writeInTx(db, UPSERT, [row.key, JSON.stringify(row.value), row.updatedAt, row.updatedBy]),
    remove: (key) => writeInTx(db, DELETE, [key]),
  };
}

/** AuditStore over the append-only `audit_logs` table (V8 columns approver_id, action_type). */
export function createAuditRepo(db: DbPort): AuditStore {
  return {
    append: (e) =>
      writeInTx(db, INSERT_AUDIT, [
        e.id,
        e.actorId,
        e.approverId,
        e.action,
        e.actionType,
        e.entityType,
        e.entityId,
        encode(e.before),
        encode(e.after),
        e.reason,
        e.createdAt,
      ]),
  };
}
