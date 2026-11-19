import type { OrderRecordStatus, RefundLineRecord, RefundRecord, RefundStore } from "@/services/ports/orders";
import type { PaymentMethodId } from "@/domain/payments";
import type { DbPort } from "../dbPort";
import { writeInTx } from "../tx";
import { mapDuplicate } from "./orderSql";
const INSERT = `INSERT INTO refunds
  (id, order_id, idempotency_key, kind, amount_rp, method, reason, executed_by, approved_by, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const INSERT_ITEM = "INSERT INTO refund_items (refund_id, order_item_id, qty, amount_rp) VALUES (?, ?, ?, ?)";
const SELECT = `SELECT id, idempotency_key, order_id, kind, amount_rp, method, reason, executed_by, approved_by, created_at
  FROM refunds WHERE `;
interface Row {
  id: string;
  idempotency_key: string;
  order_id: string;
  kind: RefundRecord["kind"];
  amount_rp: number;
  method: PaymentMethodId;
  reason: string;
  executed_by: string;
  approved_by: string | null;
  created_at: string;
}
// The schema stores no result status; it follows from the kind.
const RESULT: Record<RefundRecord["kind"], OrderRecordStatus> = {
  void: "voided",
  full: "refunded",
  partial: "partially_refunded",
};
async function loadAll(db: DbPort, where: string, param: string): Promise<RefundRecord[]> {
  const rows = await db.query<Row & Record<string, unknown>>(`${SELECT}${where} ORDER BY rowid`, [param]);
  const out: RefundRecord[] = [];
  for (const r of rows) {
    const items = await db.query<{ order_item_id: string; qty: number; amount_rp: number }>(
      "SELECT order_item_id, qty, amount_rp FROM refund_items WHERE refund_id = ? ORDER BY rowid",
      [r.id],
    );
    const lines: RefundLineRecord[] = items.map((i) => ({ lineId: i.order_item_id, qty: i.qty, amountRp: i.amount_rp }));
    out.push({
      id: r.id,
      idempotencyKey: r.idempotency_key,
      orderId: r.order_id,
      kind: r.kind,
      amountRp: r.amount_rp,
      method: r.method,
      reason: r.reason,
      userId: r.executed_by,
      approverId: r.approved_by ?? r.executed_by,
      createdAt: r.created_at,
      lines,
      resultStatus: RESULT[r.kind],
    });
  }
  return out;
}
/** RefundStore over `refunds` and `refund_items`. */
export function createRefundRepo(db: DbPort): RefundStore {
  return {
    async findByIdempotencyKey(key) {
      return (await loadAll(db, "idempotency_key = ?", key))[0] ?? null;
    },
    listByOrder: (orderId) => loadAll(db, "order_id = ?", orderId),
    async insert(r) {
      await mapDuplicate(
        () =>
          writeInTx(db, INSERT, [r.id, r.orderId, r.idempotencyKey, r.kind, r.amountRp, r.method, r.reason, r.userId, r.approverId, r.createdAt]),
        ["refunds.idempotency_key"],
        "sql: duplicate refund idempotency key",
      );
      for (const l of r.lines) await writeInTx(db, INSERT_ITEM, [r.id, l.lineId, l.qty, l.amountRp]);
    },
  };
}
