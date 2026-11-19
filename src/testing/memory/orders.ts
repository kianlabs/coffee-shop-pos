import type { AuditEntry } from "@/services/ports/settings";
import type {
  OrderRecord,
  OrderTx,
  OrderUnitOfWork,
  OutboxEntry,
  PaymentRecord,
  RefundRecord,
  StockMovementRecord,
} from "@/services/ports/orders";

interface State {
  orders: OrderRecord[];
  payments: PaymentRecord[];
  movements: StockMovementRecord[];
  outbox: OutboxEntry[];
  refunds: RefundRecord[];
  audit: AuditEntry[];
}

/** In-memory order tables with a rolling-back UnitOfWork. Test-only. */
export interface MemoryOrderDb extends State {
  uow: OrderUnitOfWork;
  /** Make the named write throw, to exercise rollback. */
  fail: { stock: boolean; outbox: boolean; audit: boolean; refunds: boolean; zeroRows: boolean };
}

const KEYS: Array<keyof State> = ["orders", "payments", "movements", "outbox", "refunds", "audit"];

export function createMemoryOrderDb(): MemoryOrderDb {
  const db: MemoryOrderDb = {
    uow: { transact: (fn) => run(fn) },
    orders: [],
    payments: [],
    movements: [],
    outbox: [],
    refunds: [],
    audit: [],
    fail: { stock: false, outbox: false, audit: false, refunds: false, zeroRows: false },
  };
  const guard = (flag: keyof MemoryOrderDb["fail"]): void => {
    if (db.fail[flag]) throw new Error(`memory: ${flag} write failed`);
  };
  const find = (id: string): OrderRecord => {
    const order = db.orders.find((o) => o.id === id);
    if (order === undefined) throw new Error(`memory: order ${id} missing`);
    return order;
  };
  const tx: OrderTx = {
    settings: { loadAll: async () => [], put: async () => undefined, remove: async () => undefined },
    audit: {
      append: async (entry) => {
        guard("audit");
        db.audit.push(structuredClone(entry));
      },
    },
    orders: {
      findByIdempotencyKey: async (key) => structuredClone(db.orders.find((o) => o.idempotencyKey === key) ?? null),
      get: async (id) => structuredClone(db.orders.find((o) => o.id === id) ?? null),
      insert: async (order) => {
        if (db.orders.some((o) => o.idempotencyKey === order.idempotencyKey)) throw new Error("memory: duplicate idempotency key");
        db.orders.push(structuredClone(order));
      },
      setStatus: async (id, status) => {
        find(id).status = status;
      },
      addRefundedQty: async (orderId, lineId, qty) => {
        const line = find(orderId).lines.find((l) => l.lineId === lineId);
        if (line === undefined) throw new Error(`memory: line ${lineId} missing`);
        if (db.fail.zeroRows || line.refundedQty + qty > line.qty) return 0;
        line.refundedQty += qty;
        return 1;
      },
    },
    payments: {
      insertMany: async (rows) => {
        db.payments.push(...structuredClone(rows));
      },
      listByOrder: async (orderId) => structuredClone(db.payments.filter((p) => p.orderId === orderId)),
      voidByOrder: async (orderId) => {
        for (const p of db.payments) if (p.orderId === orderId) p.status = "voided";
      },
    },
    stock: {
      append: async (rows) => {
        guard("stock");
        db.movements.push(...structuredClone(rows));
      },
    },
    outbox: {
      enqueue: async (entry) => {
        guard("outbox");
        db.outbox.push(structuredClone(entry));
      },
    },
    refunds: {
      findByIdempotencyKey: async (key) => structuredClone(db.refunds.find((r) => r.idempotencyKey === key) ?? null),
      insert: async (refund) => {
        guard("refunds");
        db.refunds.push(structuredClone(refund));
      },
      listByOrder: async (orderId) => structuredClone(db.refunds.filter((r) => r.orderId === orderId)),
    },
  };
  let chain: Promise<unknown> = Promise.resolve();
  // Serialized like the real write queue; restores every table when fn throws.
  function run<T>(fn: (tx: OrderTx) => Promise<T>): Promise<T> {
    const attempt = async (): Promise<T> => {
      const saved = structuredClone(Object.fromEntries(KEYS.map((k) => [k, db[k]])));
      try {
        return await fn(tx);
      } catch (e) {
        Object.assign(db, saved);
        throw e;
      }
    };
    const result = chain.then(attempt, attempt);
    chain = result.catch(() => undefined);
    return result;
  }
  return db;
}
