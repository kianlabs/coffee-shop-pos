import type { DrawerExpense, ShiftPayment } from "@/domain/shifts";
import type { CashFlowReader } from "@/services/ports/shifts";
import type { DbPort } from "../dbPort";
/**
 * Paid payments (voided excluded) with the order's change given back, ordered so the last cash payment
 * carries the change. Non-cash rows stay so the shift report can total sales per method; expectedCash counts cash only.
 */
const SALES = `SELECT p.id AS id, p.order_id AS order_id, p.amount_rp AS amount_rp,
    COALESCE(p.paid_at, p.created_at) AS at, o.change_rp AS change_rp, p.method AS method
  FROM payments p JOIN orders o ON o.id = p.order_id
  WHERE p.status IN ('paid', 'refunded')
    AND COALESCE(p.paid_at, p.created_at) BETWEEN ? AND ?
  ORDER BY p.order_id, at, p.rowid`;
/**
 * Cash handed back to customers. A void refund only counts when the sale was paid before the window
 * (otherwise the voided payment is already excluded from sales).
 */
const REFUNDS = `SELECT r.amount_rp AS amount_rp, r.created_at AS at FROM refunds r
  WHERE r.method = 'cash' AND r.created_at BETWEEN ? AND ?
    AND (r.kind IN ('full', 'partial') OR (r.kind = 'void' AND EXISTS (
      SELECT 1 FROM payments p WHERE p.order_id = r.order_id AND p.method = 'cash'
        AND COALESCE(p.paid_at, p.created_at) < ?)))
  ORDER BY r.created_at, r.rowid`;
const EXPENSES =
  "SELECT amount_rp, created_at AS at FROM cash_entries WHERE kind = 'expense' AND created_at BETWEEN ? AND ? ORDER BY created_at, rowid";
type SaleRow = { id: string; method: string; order_id: string; amount_rp: number; at: string; change_rp: number };
/** Net cash per payment: the change given back is taken off the last cash payment of the order. */
function netSales(rows: SaleRow[]): ShiftPayment[] {
  const lastByOrder = new Map<string, string>();
  for (const r of rows) if (r.method === "cash") lastByOrder.set(r.order_id, r.id);
  return rows.map((r) => {
    const change = lastByOrder.get(r.order_id) === r.id ? r.change_rp : 0;
    return { method: r.method, amountRp: Math.max(0, r.amount_rp - change), recordedAt: r.at, kind: "sale" };
  });
}
/** Reads cash movements from the real `payments`, `orders`, `refunds`, and `cash_entries` tables (V10, V12). */
export function createCashFlowRepo(db: DbPort): CashFlowReader {
  return {
    async payments(from, to) {
      const sales = await db.query<SaleRow>(SALES, [from, to]);
      const refunds = await db.query<{ amount_rp: number; at: string }>(REFUNDS, [from, to, from]);
      const payouts = refunds.map((r): ShiftPayment => ({ method: "cash", amountRp: r.amount_rp, recordedAt: r.at, kind: "refund" }));
      return [...netSales(sales), ...payouts];
    },
    async drawerExpenses(from, to) {
      const rows = await db.query<{ amount_rp: number; at: string }>(EXPENSES, [from, to]);
      return rows.map((r): DrawerExpense => ({ amountRp: r.amount_rp, recordedAt: r.at }));
    },
  };
}
