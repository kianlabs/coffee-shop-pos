import type { ModuleRow, ModuleStore, ModuleUnitOfWork } from "@/services/ports/modules";
import type { DbPort } from "../dbPort";
import { withPortTransaction, writeInTx } from "../tx";
import { createAuditRepo, createSettingsRepo } from "./settingsRepo";
const SELECT_ALL = "SELECT id, enabled, enabled_at, updated_by FROM modules";
const UPSERT = `INSERT INTO modules (id, enabled, enabled_at, updated_by) VALUES (?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, enabled_at = excluded.enabled_at, updated_by = excluded.updated_by`;
type Row = { id: string; enabled: number; enabled_at: string | null; updated_by: string | null };
/** ModuleStore over the V8 `modules` table. */
export function createModuleRepo(db: DbPort): ModuleStore {
  return {
    async loadAll(): Promise<ModuleRow[]> {
      const rows = await db.query<Row>(SELECT_ALL);
      return rows.map((r) => ({ id: r.id, enabled: r.enabled === 1, enabledAt: r.enabled_at, updatedBy: r.updated_by }));
    },
    put: (row) => writeInTx(db, UPSERT, [row.id, row.enabled ? 1 : 0, row.enabledAt, row.updatedBy]),
  };
}
/** One serialized SQLite transaction exposing settings, audit, and modules stores. */
export function createModuleUnitOfWork(db: DbPort): ModuleUnitOfWork {
  const tx = { settings: createSettingsRepo(db), audit: createAuditRepo(db), modules: createModuleRepo(db) };
  return { transact: (fn) => withPortTransaction(db, () => fn(tx)) };
}
