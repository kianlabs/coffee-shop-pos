import type { Clock, Ids, Tx, UnitOfWork } from "@/services/ports";
import type { AuditEntry, StoredSetting } from "@/services/ports/settings";

interface MemoryRow {
  json: string;
  updatedAt: string;
  updatedBy: string;
}

/** In-memory settings and audit tables with a transactional UnitOfWork. Test-only. */
export interface MemorySettingsDb {
  uow: UnitOfWork;
  rows: Map<string, MemoryRow>;
  audit: AuditEntry[];
  /** When true, every audit append throws. */
  failAudit: boolean;
  /** When true, every settings write throws. */
  failWrites: boolean;
}

export function createMemorySettingsDb(): MemorySettingsDb {
  const db: MemorySettingsDb = { uow: { transact: (fn) => run(fn) }, rows: new Map(), audit: [], failAudit: false, failWrites: false };
  let chain: Promise<unknown> = Promise.resolve();
  const tx: Tx = {
    settings: {
      loadAll: async (): Promise<StoredSetting[]> => [...db.rows].map(([key, row]) => ({ key, value: JSON.parse(row.json) })),
      put: async (row) => {
        if (db.failWrites) throw new Error("memory: settings write failed");
        db.rows.set(row.key, { json: JSON.stringify(row.value), updatedAt: row.updatedAt, updatedBy: row.updatedBy });
      },
      remove: async (key) => {
        if (db.failWrites) throw new Error("memory: settings write failed");
        db.rows.delete(key);
      },
    },
    audit: {
      append: async (entry) => {
        if (db.failAudit) throw new Error("memory: audit append failed");
        db.audit.push(structuredClone(entry));
      },
    },
  };
  // Serialized like the real write queue; restores both tables when fn throws.
  function run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const attempt = async (): Promise<T> => {
      const rows = new Map(db.rows);
      const auditLength = db.audit.length;
      try {
        return await fn(tx);
      } catch (e) {
        db.rows = rows;
        db.audit.length = auditLength;
        throw e;
      }
    };
    const result = chain.then(attempt, attempt);
    chain = result.catch(() => undefined);
    return result;
  }
  return db;
}

export function fixedClock(iso = "2026-11-19T00:00:00.000Z"): Clock {
  return { now: () => new Date(iso) };
}

export function sequentialIds(prefix = "id"): Ids {
  let n = 0;
  return { next: () => `${prefix}-${++n}` };
}
