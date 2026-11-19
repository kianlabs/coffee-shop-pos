import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { DbPort, SqlParam } from "./dbPort";

/**
 * Utilitas transaksi manual untuk operasi tulis yang harus atomik.
 *
 * `executeTransaction()` dari plugin SELALU membuka transaksi baru, jadi tidak
 * bisa dipakai di dalam transaksi manual. Di sini statement dijalankan satu per
 * satu dengan `transaction = false` supaya semuanya masuk ke transaksi yang
 * dibuka oleh `withTransaction()`.
 */

export type SqlStatement = { statement: string; values?: unknown[] };

/**
 * Serializer untuk operasi tulis di SATU koneksi SQLite. SQLite hanya punya
 * satu transaksi aktif per koneksi; kalau dua checkout berjalan bersamaan,
 * transaksi kedua bisa ikut ter-commit/rollback oleh yang pertama. Semua
 * pemanggil `withTransaction()` harus lewat sini.
 */
let writeChain: Promise<unknown> = Promise.resolve();

export function runSerializedWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function execStatement(db: SQLiteDBConnection, stmt: SqlStatement): Promise<void> {
  if (stmt.values && stmt.values.length > 0) {
    await db.run(stmt.statement, stmt.values, false);
    return;
  }
  await db.execute(stmt.statement, false);
}

/**
 * Jalankan `fn` di dalam satu transaksi. Setiap error di-rollback dan
 * diteruskan ke pemanggil; koneksi tidak pernah ditinggal dengan transaksi
 * terbuka.
 */
export async function withTransaction<T>(
  db: SQLiteDBConnection,
  fn: () => Promise<T>,
): Promise<T> {
  await db.beginTransaction();
  try {
    const result = await fn();
    await db.commitTransaction();
    return result;
  } catch (e) {
    try {
      await db.rollbackTransaction();
    } catch {
      // Commit bisa sudah otomatis rollback (mis. constraint berat); abaikan
      // kegagalan rollback dan laporkan error aslinya.
    }
    throw e;
  }
}

/** Eksekusi sekumpulan statement di dalam transaksi manual yang sudah aktif. */
export async function execStatements(
  db: SQLiteDBConnection,
  statements: SqlStatement[],
): Promise<void> {
  for (const stmt of statements) {
    await execStatement(db, stmt);
  }
}

/**
 * Runs `fn` between BEGIN and COMMIT on a DbPort, queued behind every other
 * write. Any error rolls back and is rethrown.
 */
export function withPortTransaction<T>(db: DbPort, fn: () => Promise<T>): Promise<T> {
  return runSerializedWrite(async () => {
    await db.exec("BEGIN");
    try {
      const result = await fn();
      await db.exec("COMMIT");
      return result;
    } catch (e) {
      try {
        await db.exec("ROLLBACK");
      } catch {
        // Keep the original error.
      }
      throw e;
    }
  });
}

/** One parameterized write for repositories that run inside `withPortTransaction`. */
export function writeInTx(db: DbPort, sql: string, params: SqlParam[]): Promise<void> {
  return db.run(sql, params);
}
