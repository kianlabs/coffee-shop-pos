import type { DbPort } from "@/data/dbPort";
/**
 * Table discovery shared by the backup serializer and restore. Identifiers
 * cannot be bound as parameters, so callers only quote names that came from
 * `sqlite_master` of the same database.
 */
export const quoteIdent = (name: string): string => `"${name.replaceAll('"', '""')}"`;
/** User tables, excluding SQLite internals and the runner's bookkeeping table. */
export async function listBackupTables(db: DbPort): Promise<string[]> {
  const rows = await db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name <> ? ORDER BY name",
    ["schema_migrations"],
  );
  return rows.map((r) => r.name);
}
export async function tableColumns(db: DbPort, table: string): Promise<string[]> {
  const rows = await db.query<{ name: string }>("SELECT name FROM pragma_table_info(?) ORDER BY cid", [table]);
  return rows.map((r) => r.name);
}
