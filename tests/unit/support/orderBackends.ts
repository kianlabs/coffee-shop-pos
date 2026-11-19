import type { DbPort, SqlParam } from "@/data/dbPort";
import { createOrderUnitOfWork } from "@/data/repos/orderRepo";
import type { CheckoutService } from "@/services/checkoutService";
import type { OrderUnitOfWork } from "@/services/ports/orders";
import type { RefundService } from "@/services/refundService";
import { createMemoryOrderDb } from "@/testing/memory/orders";
import { openSqlJsDb } from "@/testing/sqlJsDb";
import { migrate } from "./migrationHarness";
import { servicesFor } from "./orderFixtures";
export type FailStep = "stock" | "outbox" | "audit" | "refunds";
/** Table state normalised so the memory store and the SQL adapter can be compared. */
export interface Snapshot {
  orders: unknown[];
  lines: unknown[];
  payments: unknown[];
  movements: unknown[];
  outbox: unknown[];
  refunds: unknown[];
  audit: number;
}
export interface Backend {
  name: string;
  uow: OrderUnitOfWork;
  deps: ReturnType<typeof servicesFor>["deps"];
  checkout: CheckoutService;
  refunds: RefundService;
  fail(step: FailStep, on: boolean): void;
  snapshot(): Promise<Snapshot>;
  /** Violations of `PRAGMA foreign_key_check` (always empty for memory). */
  fkViolations(): Promise<unknown[]>;
  close(): void;
}
export function memoryBackend(): Backend {
  const db = createMemoryOrderDb();
  return {
    name: "memory",
    uow: db.uow,
    ...servicesFor(db.uow),
    fail: (step, on) => {
      db.fail[step] = on;
    },
    snapshot: async () => ({
      orders: db.orders.map((o) => ({ id: o.id, key: o.idempotencyKey, status: o.status, totalRp: o.totalRp })),
      lines: db.orders.flatMap((o) => o.lines.map((l) => ({ id: l.lineId, refundedQty: l.refundedQty }))),
      payments: db.payments.map((p) => ({ id: p.id, orderId: p.orderId, status: p.status, amountRp: p.amountRp, method: p.method })),
      movements: db.movements.map((m) => ({ ...m })),
      outbox: db.outbox.map((e) => ({ type: e.entityType, id: e.entityId })),
      refunds: db.refunds.map((r) => ({ id: r.id, orderId: r.orderId, amountRp: r.amountRp, kind: r.kind })),
      audit: db.audit.length,
    }),
    fkViolations: async () => [],
    close: () => undefined,
  };
}
const FAIL_PATTERNS: Record<FailStep, RegExp> = {
  stock: /INSERT INTO stock_movements/,
  outbox: /INSERT INTO sync_outbox/,
  audit: /INSERT INTO audit_logs/,
  refunds: /INSERT INTO refunds\b/,
};
const USERS = ["u-1", "u-sup", "u-k", "u-k2"];
const PRODUCTS = ["p-a", "p-b", "p-c"];
const INGREDIENTS = ["beans", "milk"];
const T = "2026-01-01T00:00:00.000Z";
async function seed(db: DbPort): Promise<void> {
  for (const id of USERS) {
    await db.run(
      "INSERT INTO users (id, display_name, display_name_ci, role, pin_hash, created_at, updated_at) VALUES (?, ?, ?, 'owner', 'x', ?, ?)",
      [id, id, id, T, T],
    );
  }
  for (const id of PRODUCTS) {
    await db.run("INSERT INTO products (id, name, base_price_rp, created_at, updated_at) VALUES (?, ?, 0, ?, ?)", [id, id, T, T]);
  }
  for (const id of INGREDIENTS) {
    await db.run("INSERT INTO ingredients (id, name, base_unit, created_at) VALUES (?, ?, 'g', ?)", [id, id, T]);
  }
}
/** The adapter over sql.js: migrated with the real steps, foreign keys ON, seeded users, products and ingredients. */
export async function sqlBackend(): Promise<Backend> {
  const raw = await openSqlJsDb();
  await raw.exec("PRAGMA foreign_keys = ON");
  await migrate(raw);
  await seed(raw);
  const failing = new Set<FailStep>();
  const db: DbPort = {
    exec: (sql) => raw.exec(sql),
    query: (sql, params) => raw.query(sql, params),
    async run(sql: string, params?: SqlParam[]) {
      for (const step of failing) if (FAIL_PATTERNS[step].test(sql)) throw new Error(`sql: ${step} write failed`);
      await raw.run(sql, params);
    },
  };
  const uow = createOrderUnitOfWork(db);
  const rows = (sql: string) => raw.query<Record<string, unknown>>(sql);
  return {
    name: "sql",
    uow,
    ...servicesFor(uow),
    fail: (step, on) => {
      if (on) failing.add(step);
      else failing.delete(step);
    },
    snapshot: async () => ({
      orders: (await rows("SELECT id, idempotency_key AS key, status, total_rp AS totalRp FROM orders ORDER BY rowid")),
      lines: await rows("SELECT id, refunded_qty AS refundedQty FROM order_items ORDER BY rowid"),
      payments: await rows("SELECT id, order_id AS orderId, status, amount_rp AS amountRp, method FROM payments ORDER BY rowid"),
      movements: await rows(
        `SELECT id, ingredient_id AS ingredientId, movement_type AS type, qty_milli AS qtyMilli,
         reference_type AS referenceType, reference_id AS referenceId, created_at AS createdAt FROM stock_movements ORDER BY rowid`,
      ),
      outbox: await rows("SELECT aggregate_type AS type, aggregate_id AS id FROM sync_outbox ORDER BY rowid"),
      refunds: await rows("SELECT id, order_id AS orderId, amount_rp AS amountRp, kind FROM refunds ORDER BY rowid"),
      audit: (await rows("SELECT id FROM audit_logs")).length,
    }),
    fkViolations: () => raw.query("PRAGMA foreign_key_check"),
    close: () => raw.close(),
  };
}
