import type { OrderRecord, OrderRecordStatus, OrderStore, OrderTx, OrderUnitOfWork } from "@/services/ports/orders";
import type { DbPort } from "../dbPort";
import { withPortTransaction, writeInTx } from "../tx";
import { insertLines, loadLines } from "./orderLines";
import { changes, mapDuplicate } from "./orderSql";
import { createPaymentRepo } from "./paymentRepo";
import { createOutboxRepo } from "./outboxRepo";
import { createRefundRepo } from "./refundRepo";
import { createAuditRepo, createSettingsRepo } from "./settingsRepo";
import { createStockRepo } from "./stockRepo";
// receipt_number is NOT NULL UNIQUE; the order id is already unique, so it doubles as the number until receipts get their own sequence.
const INSERT_ORDER = `INSERT INTO orders
  (id, receipt_number, idempotency_key, status, subtotal_rp, discount_rp, tax_rp, service_charge_rp, rounding_rp,
   total_rp, created_at, updated_at, user_id, change_rp)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const SELECT_ORDER = `SELECT id, idempotency_key, status, user_id, created_at, subtotal_rp, discount_rp, service_charge_rp,
  tax_rp, rounding_rp, total_rp, change_rp FROM orders WHERE `;
interface OrderRow {
  id: string;
  idempotency_key: string;
  status: OrderRecordStatus;
  user_id: string | null;
  created_at: string;
  subtotal_rp: number;
  discount_rp: number;
  service_charge_rp: number;
  tax_rp: number;
  rounding_rp: number;
  total_rp: number;
  change_rp: number;
}
async function load(db: DbPort, where: string, param: string): Promise<OrderRecord | null> {
  const [r] = await db.query<OrderRow & Record<string, unknown>>(SELECT_ORDER + where, [param]);
  if (r === undefined) return null;
  return {
    id: r.id,
    idempotencyKey: r.idempotency_key,
    status: r.status,
    userId: r.user_id ?? "",
    createdAt: r.created_at,
    subtotalRp: r.subtotal_rp,
    discountRp: r.discount_rp,
    serviceChargeRp: r.service_charge_rp,
    taxRp: r.tax_rp,
    roundingRp: r.rounding_rp,
    totalRp: r.total_rp,
    changeRp: r.change_rp,
    lines: await loadLines(db, r.id),
  };
}
/** OrderStore over `orders`, `order_items`, `order_item_modifiers` and `order_item_consumption`. */
export function createOrderStore(db: DbPort): OrderStore {
  return {
    findByIdempotencyKey: (key) => load(db, "idempotency_key = ?", key),
    get: (id) => load(db, "id = ?", id),
    async insert(o) {
      await mapDuplicate(
        () =>
          writeInTx(db, INSERT_ORDER, [
            o.id, o.id, o.idempotencyKey, o.status, o.subtotalRp, o.discountRp, o.taxRp, o.serviceChargeRp,
            o.roundingRp, o.totalRp, o.createdAt, o.createdAt, o.userId, o.changeRp,
          ]),
        ["orders.idempotency_key"],
        "sql: duplicate idempotency key",
      );
      await insertLines(db, o.id, o.createdAt, o.lines);
    },
    async setStatus(id, status) {
      await writeInTx(db, "UPDATE orders SET status = ? WHERE id = ?", [status, id]);
      if ((await changes(db)) !== 1) throw new Error(`sql: order ${id} missing`);
    },
    async addRefundedQty(orderId, lineId, qty) {
      await writeInTx(
        db,
        "UPDATE order_items SET refunded_qty = refunded_qty + ? WHERE id = ? AND order_id = ? AND refunded_qty + ? <= quantity",
        [qty, lineId, orderId, qty],
      );
      return changes(db);
    },
  };
}
/** Every order, payment, stock, outbox, refund, audit and settings write of one `transact` is one serialized SQLite transaction. */
export function createOrderUnitOfWork(db: DbPort): OrderUnitOfWork {
  const tx: OrderTx = {
    settings: createSettingsRepo(db),
    audit: createAuditRepo(db),
    orders: createOrderStore(db),
    payments: createPaymentRepo(db),
    stock: createStockRepo(db),
    outbox: createOutboxRepo(db),
    refunds: createRefundRepo(db),
  };
  return { transact: (fn) => withPortTransaction(db, () => fn(tx)) };
}
