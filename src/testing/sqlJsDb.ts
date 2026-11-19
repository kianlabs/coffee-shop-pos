import initSqlJs, { type Database, type SqlValue } from "sql.js";
import { type DbPort, type SqlParam } from "@/data/dbPort";

/** In-memory SQLite for tests. Not part of the app bundle. */
export async function openSqlJsDb(): Promise<DbPort & { close(): void }> {
  const SQL = await initSqlJs();
  const db: Database = new SQL.Database();
  return {
    async exec(sql: string): Promise<void> {
      db.exec(sql);
    },
    async run(sql: string, params: SqlParam[] = []): Promise<void> {
      db.run(sql, params as SqlValue[]);
    },
    async query<T extends Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T[]> {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params as SqlValue[]);
        const rows: T[] = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject() as T);
        }
        return rows;
      } finally {
        stmt.free();
      }
    },
    close(): void {
      db.close();
    },
  };
}
