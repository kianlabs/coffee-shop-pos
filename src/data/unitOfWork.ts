import type { Tx, UnitOfWork } from "@/services/ports";
import type { DbPort } from "./dbPort";
import { createAuditRepo, createSettingsRepo } from "./repos/settingsRepo";
import { withPortTransaction } from "./tx";

/** UnitOfWork over one DbPort connection: every `transact` is one serialized SQLite transaction. */
export function createUnitOfWork(db: DbPort): UnitOfWork {
  const tx: Tx = { settings: createSettingsRepo(db), audit: createAuditRepo(db) };
  return { transact: (fn) => withPortTransaction(db, () => fn(tx)) };
}
