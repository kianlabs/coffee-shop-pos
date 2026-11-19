/**
 * Minimal database port used by repositories and migration code. The Android
 * app implements it with the Capacitor SQLite plugin; tests implement it with
 * sql.js. Keeping it this small makes migrations testable without a device.
 */
export type SqlParam = string | number | null;

export interface DbPort {
  /** Runs one or more statements that return no rows. */
  exec(sql: string): Promise<void>;
  /** Runs a single statement with bound parameters and returns row objects. */
  query<T extends Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
}
