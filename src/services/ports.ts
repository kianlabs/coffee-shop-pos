import type { AuditStore, SettingsStore } from "./ports/settings";

/** Stores available inside one transaction. Other services add their stores here. */
export interface Tx {
  settings: SettingsStore;
  audit: AuditStore;
}

/**
 * Runs `fn` in one serialized write transaction; a thrown error rolls everything back.
 * Named `transact` rather than `run`: check-boundaries treats any `.run(` call as a raw SQLite write.
 */
export interface UnitOfWork {
  transact<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

export interface Clock {
  now(): Date;
}

export interface Ids {
  next(): string;
}
