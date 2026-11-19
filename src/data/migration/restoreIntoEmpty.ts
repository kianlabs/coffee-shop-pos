import {
  BACKUP_REJECTION_MESSAGES,
  verifyBackupDocument,
  type BackupDocument,
  type BackupRejection,
  type BackupSha256,
} from "@/domain/backup";
import { listBackupTables, quoteIdent, tableColumns } from "@/data/backupTables";
import type { DbPort } from "@/data/dbPort";
import type { Transaction } from "@/data/migration/runner";
import { runSerializedWrite } from "@/data/tx";
export type RestoreFailure = BackupRejection | "target";
export class BackupRestoreError extends Error {
  constructor(
    readonly reason: RestoreFailure,
    message: string,
  ) {
    super(message);
  }
}
export interface RestoreOptions {
  transaction: Transaction;
  sha256: BackupSha256;
  latestSchemaVersion: number;
}
/** Every table in the document must exist in the target, be empty, and have the listed columns. */
async function assertEmptyTarget(db: DbPort, doc: BackupDocument): Promise<void> {
  const existing = new Set(await listBackupTables(db));
  for (const [name, table] of Object.entries(doc.tables)) {
    if (!existing.has(name)) throw new BackupRestoreError("target", `Tabel ${name} tidak ada di database tujuan.`);
    const columns = new Set(await tableColumns(db, name));
    const missing = table.columns.find((c) => !columns.has(c));
    if (missing) throw new BackupRestoreError("target", `Kolom ${name}.${missing} tidak ada di database tujuan.`);
    const [{ n }] = await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${quoteIdent(name)}`);
    if (n > 0) throw new BackupRestoreError("target", `Tabel ${name} di database tujuan tidak kosong.`);
  }
}
async function insertRows(db: DbPort, doc: BackupDocument): Promise<void> {
  for (const [name, table] of Object.entries(doc.tables)) {
    if (table.rows.length === 0) continue;
    const cols = table.columns.map(quoteIdent).join(", ");
    const marks = table.columns.map(() => "?").join(", ");
    const sql = `INSERT INTO ${quoteIdent(name)} (${cols}) VALUES (${marks})`;
    for (const row of table.rows) await db.run(sql, row);
  }
}
/**
 * Loads a verified backup into a database whose schema exists but holds no
 * rows. Nothing is written when the checksum, schema version, or target check
 * fails. Foreign keys are checked at commit, so table order does not matter.
 */
export async function restoreIntoEmpty(db: DbPort, doc: BackupDocument, opts: RestoreOptions): Promise<void> {
  const rejection = await verifyBackupDocument(doc, opts);
  if (rejection) throw new BackupRestoreError(rejection, BACKUP_REJECTION_MESSAGES[rejection]);
  await runSerializedWrite(() =>
    opts.transaction(async (tx) => {
      await assertEmptyTarget(tx, doc);
      await tx.exec("PRAGMA defer_foreign_keys = ON");
      await insertRows(tx, doc);
    }),
  );
}
