import type { CatalogRow } from "@/domain/catalogCsv";
import { catalogKey } from "@/domain/catalogCsv";
import type { CatalogImportTx, CatalogImportUnitOfWork } from "@/services/ports/catalogImport";
import { createMemorySettingsDb, type MemorySettingsDb } from "./settings";

export interface MemoryCatalogDb extends Omit<MemorySettingsDb, "uow"> {
  uow: CatalogImportUnitOfWork;
  catalog: Map<string, CatalogRow>;
  /** When true, the catalog write throws. */
  failUpsert: boolean;
}

/** In-memory catalog on top of the memory settings/audit db. A failed transaction restores both. Test-only. */
export function createMemoryCatalogDb(seed: readonly CatalogRow[] = []): MemoryCatalogDb {
  const base = createMemorySettingsDb();
  const baseTransact = base.uow.transact.bind(base.uow);
  // Extend in place so flags and rollback of the base tables stay shared with the base object.
  const db: MemoryCatalogDb = Object.assign(base, {
    catalog: new Map(seed.map((r) => [catalogKey(r), { ...r }])),
    failUpsert: false,
    uow: { transact: <T>(fn: (tx: CatalogImportTx) => Promise<T>) => transact(fn) } as CatalogImportUnitOfWork,
  });
  function transact<T>(fn: (tx: CatalogImportTx) => Promise<T>): Promise<T> {
    return baseTransact(async (baseTx) => {
      const before = new Map([...db.catalog].map(([k, r]) => [k, { ...r }]));
      const tx: CatalogImportTx = {
        ...baseTx,
        catalog: {
          loadExisting: async () => [...db.catalog].map(([key, r]) => ({ key, priceRp: r.priceRp, hppManualRp: r.hppManualRp })),
          upsertAll: async (rows) => {
            for (const r of rows) {
              if (db.failUpsert) throw new Error("memory: catalog write failed");
              db.catalog.set(catalogKey(r), { ...r });
            }
          },
        },
      };
      try {
        return await fn(tx);
      } catch (e) {
        db.catalog = before;
        throw e;
      }
    });
  }
  return db;
}
