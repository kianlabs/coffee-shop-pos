import type { Tx } from "../ports";
export interface ModuleRow {
  id: string;
  enabled: boolean;
  enabledAt: string | null;
  updatedBy: string | null;
}
/** Activation state over the `modules` table. Module data tables are never touched. */
export interface ModuleStore {
  loadAll(): Promise<ModuleRow[]>;
  put(row: ModuleRow): Promise<void>;
}
/** Settings transaction stores plus the modules store, so the audit row and the flag commit together. */
export interface ModuleTx extends Tx {
  modules: ModuleStore;
}
export interface ModuleUnitOfWork {
  transact<T>(fn: (tx: ModuleTx) => Promise<T>): Promise<T>;
}
