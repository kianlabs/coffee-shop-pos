import { createBackupDocument, type BackupCell, type BackupDocument, type BackupSha256, type BackupTables } from "@/domain/backup";
import { listBackupTables, quoteIdent, tableColumns } from "@/data/backupTables";
import type { DbPort } from "@/data/dbPort";
// Restore writes rows, so it lives under src/data/migration/ (the write-path guard).
export { restoreIntoEmpty, BackupRestoreError, type RestoreOptions } from "@/data/migration/restoreIntoEmpty";
function toCell(value: unknown, table: string, column: string): BackupCell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`Kolom ${table}.${column} berisi tipe data yang belum didukung backup.`);
}
/** Reads every row of every user table. Column order follows the table definition. */
export async function exportTables(db: DbPort): Promise<BackupTables> {
  const tables: BackupTables = {};
  for (const name of await listBackupTables(db)) {
    const columns = await tableColumns(db, name);
    const rows = await db.query<Record<string, unknown>>(`SELECT * FROM ${quoteIdent(name)}`);
    tables[name] = { columns, rows: rows.map((row) => columns.map((c) => toCell(row[c], name, c))) };
  }
  return tables;
}
export interface ExportOptions {
  createdAt: string;
  appVersion: string;
  sha256: BackupSha256;
  /** Defaults to `PRAGMA user_version`. Pre-migration backups pass the source version. */
  schemaVersion?: number;
}
async function userVersion(db: DbPort): Promise<number> {
  const rows = await db.query<{ user_version: number }>("PRAGMA user_version");
  return rows[0]?.user_version ?? 0;
}
export async function exportBackup(db: DbPort, opts: ExportOptions): Promise<BackupDocument> {
  const [tables, schemaVersion] = await Promise.all([exportTables(db), opts.schemaVersion ?? userVersion(db)]);
  return createBackupDocument({ schemaVersion, createdAt: opts.createdAt, appVersion: opts.appVersion, tables }, opts.sha256);
}
