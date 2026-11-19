import type { PaymentMethodId } from "@/domain/payments";
import type { PaymentRecord, PaymentStore } from "@/services/ports/orders";
import type { DbPort } from "../dbPort";
import { writeInTx } from "../tx";
import { changes } from "./orderSql";
// Payment time follows the order, which the payment row references.
const INSERT = `INSERT INTO payments (id, order_id, method, amount_rp, status, reference_note, paid_at, created_at)
  SELECT ?, id, ?, ?, ?, ?, created_at, created_at FROM orders WHERE id = ?`;
interface Row {
  id: string;
  order_id: string;
  method: PaymentMethodId;
  amount_rp: number;
  status: "paid" | "voided";
  reference_note: string | null;
}
/** PaymentStore over `payments` (V12 table). */
export function createPaymentRepo(db: DbPort): PaymentStore {
  return {
    async insertMany(rows) {
      for (const p of rows) {
        await writeInTx(db, INSERT, [p.id, p.method, p.amountRp, p.status, p.reference, p.orderId]);
        if ((await changes(db)) !== 1) throw new Error(`sql: order ${p.orderId} missing for payment ${p.id}`);
      }
    },
    async listByOrder(orderId) {
      const rows = await db.query<Row & Record<string, unknown>>(
        "SELECT id, order_id, method, amount_rp, status, reference_note FROM payments WHERE order_id = ? ORDER BY rowid",
        [orderId],
      );
      return rows.map<PaymentRecord>((r) => ({
        id: r.id,
        orderId: r.order_id,
        method: r.method,
        amountRp: r.amount_rp,
        status: r.status,
        reference: r.reference_note,
      }));
    },
    voidByOrder: (orderId) => writeInTx(db, "UPDATE payments SET status = 'voided' WHERE order_id = ?", [orderId]),
  };
}
