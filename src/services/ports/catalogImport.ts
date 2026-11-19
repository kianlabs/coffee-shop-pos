import type { Tx } from "../ports";
import type { CatalogRow } from "@/domain/catalogCsv";

export interface ExistingCatalogRow {
  key: string;
  priceRp: number;
  hppManualRp: number | null;
}

/** Catalog writes needed by the CSV import. Rows are matched by category, product and variant name. */
export interface CatalogImportStore {
  loadExisting(): Promise<ExistingCatalogRow[]>;
  /** Creates missing categories, products and variants, and updates price and HPP of existing variants. */
  upsertAll(rows: readonly CatalogRow[]): Promise<void>;
}

export interface CatalogImportTx extends Tx {
  catalog: CatalogImportStore;
}

export interface CatalogImportUnitOfWork {
  transact<T>(fn: (tx: CatalogImportTx) => Promise<T>): Promise<T>;
}
