import type { CashEntryRecord, ShiftRecord, ShiftStatus, ShiftStore, ShiftTx, ShiftUnitOfWork } from "@/services/ports/shifts";
import type { DbPort } from "../dbPort";
import { withPortTransaction, writeInTx } from "../tx";
import { createCartRepo, createHeldOrderRepo } from "./cartRepo";
import { createCashFlowRepo } from "./cashFlowRepo";
import { createAuditRepo, createSettingsRepo } from "./settingsRepo";
const COLUMNS = `id, opened_by, opened_at, opening_cash_rp, status, closed_by, closed_at,
  counted_cash_rp, expected_cash_rp, variance_rp, variance_reason`;
const INSERT = `INSERT INTO shifts (id, opened_by, opened_at, opening_cash_rp, status, closed_by, closed_at,
  counted_cash_rp, expected_cash_rp, variance_rp, variance_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const UPDATE = `UPDATE shifts SET status = ?, closed_by = ?, closed_at = ?, counted_cash_rp = ?,
  expected_cash_rp = ?, variance_rp = ?, variance_reason = ? WHERE id = ?`;
const INSERT_ENTRY = `INSERT INTO cash_entries (id, shift_id, kind, amount_rp, reason, user_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;
/** Same error the in-memory store throws when a second shift would be open. */
const ONE_OPEN = "one open shift per device";
type ShiftRow = {
  id: string; opened_by: string; opened_at: string; opening_cash_rp: number; status: string;
  closed_by: string | null; closed_at: string | null; counted_cash_rp: number | null;
  expected_cash_rp: number | null; variance_rp: number | null; variance_reason: string | null;
};
type EntryRow = { id: string; shift_id: string; kind: string; amount_rp: number; reason: string; user_id: string; created_at: string };
const toSqlStatus = (s: ShiftStatus): string => (s === "open" ? "terbuka" : "ditutup");
const toStatus = (s: string): ShiftStatus => (s === "terbuka" ? "open" : "closed");
function toShift(r: ShiftRow): ShiftRecord {
  return {
    id: r.id, openedBy: r.opened_by, openedAt: r.opened_at, openCashRp: r.opening_cash_rp, status: toStatus(r.status),
    closedBy: r.closed_by, closedAt: r.closed_at, countedCashRp: r.counted_cash_rp, expectedCashRp: r.expected_cash_rp,
    differenceRp: r.variance_rp, differenceReason: r.variance_reason,
  };
}
const toEntry = (r: EntryRow): CashEntryRecord => ({
  id: r.id, shiftId: r.shift_id, type: r.kind === "in" ? "cash_in" : "cash_out", amountRp: r.amount_rp,
  reason: r.reason, recordedAt: r.created_at, recordedBy: r.user_id,
});
/** Turns a violation of the partial unique index `uq_one_open_shift` into the memory store's error. */
async function guardOneOpen(write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/uq_one_open_shift|UNIQUE constraint failed: shifts\.status/i.test(message)) throw new Error(`sql: ${ONE_OPEN}`);
    throw e;
  }
}
/** ShiftStore over `shifts` and `cash_entries` (V10). Status maps open/closed to terbuka/ditutup. */
export function createShiftRepo(db: DbPort): ShiftStore {
  const one = async (sql: string, params: string[]): Promise<ShiftRecord | null> => {
    const rows = await db.query<ShiftRow>(sql, params);
    return rows[0] ? toShift(rows[0]) : null;
  };
  return {
    findOpen: () => one(`SELECT ${COLUMNS} FROM shifts WHERE status = 'terbuka' LIMIT 1`, []),
    get: (id) => one(`SELECT ${COLUMNS} FROM shifts WHERE id = ?`, [id]),
    insert: (s) =>
      guardOneOpen(() =>
        writeInTx(db, INSERT, [
          s.id, s.openedBy, s.openedAt, s.openCashRp, toSqlStatus(s.status), s.closedBy, s.closedAt,
          s.countedCashRp, s.expectedCashRp, s.differenceRp, s.differenceReason,
        ]),
      ),
    update: (s) =>
      guardOneOpen(() =>
        writeInTx(db, UPDATE, [
          toSqlStatus(s.status), s.closedBy, s.closedAt, s.countedCashRp, s.expectedCashRp, s.differenceRp, s.differenceReason, s.id,
        ]),
      ),
    // Drawer expenses (kind 'expense') are read by cashFlow, not returned as cash in/out.
    entries: async (shiftId) =>
      (await db.query<EntryRow>(
        "SELECT id, shift_id, kind, amount_rp, reason, user_id, created_at FROM cash_entries WHERE shift_id = ? AND kind IN ('in','out') ORDER BY rowid",
        [shiftId],
      )).map(toEntry),
    addEntry: (e) =>
      writeInTx(db, INSERT_ENTRY, [e.id, e.shiftId, e.type === "cash_in" ? "in" : "out", e.amountRp, e.reason, e.recordedBy, e.recordedAt]),
  };
}
export interface ShiftUnitOfWorkOptions {
  /** User id stored on the active cart row. Defaults to the open shift's opener, then the first active user. */
  cartUserId?: () => string | null;
}
/** One serialized SQLite transaction exposing settings, audit, shifts, carts, held orders, and cash flow. */
export function createShiftUnitOfWork(db: DbPort, options: ShiftUnitOfWorkOptions = {}): ShiftUnitOfWork {
  const tx: ShiftTx = {
    settings: createSettingsRepo(db),
    audit: createAuditRepo(db),
    shifts: createShiftRepo(db),
    carts: createCartRepo(db, options.cartUserId),
    heldOrders: createHeldOrderRepo(db),
    cashFlow: createCashFlowRepo(db),
  };
  return { transact: (fn) => withPortTransaction(db, () => fn(tx)) };
}
