import { charLength } from "@/domain/validation";
import { cashDifference, expectedCash, validateCountedCash } from "@/domain/shifts";
import type { Clock, Ids } from "./ports";
import type { CashEntryRecord, ShiftRecord, ShiftTx, ShiftUnitOfWork } from "./ports/shifts";
import type { SettingsService } from "./settingsService";
import { buildZReport, type ZReport } from "./shiftReport";

export interface ShiftActor {
  id: string;
  role: "owner" | "supervisor" | "kasir";
}

export type ShiftErrorCode =
  | "invalid_input"
  | "already_open"
  | "no_open_shift"
  | "reason_required"
  | "save_failed";

export type ShiftResult<T> = { ok: true; value: T } | { ok: false; code: ShiftErrorCode; message: string; differenceRp?: number };

export interface ShiftServiceDeps {
  uow: ShiftUnitOfWork;
  settings: Pick<SettingsService, "get">;
  clock: Clock;
  ids: Ids;
}

export interface CashEntryInput {
  type: "cash_in" | "cash_out";
  amountRp: number;
  reason: string;
}

export interface CloseShiftInput {
  countedCashRp: number;
  differenceReason?: string;
}

export interface OpenShiftView {
  shift: ShiftRecord;
  entries: CashEntryRecord[];
}

const fail = (code: ShiftErrorCode, message: string, differenceRp?: number): { ok: false; code: ShiftErrorCode; message: string; differenceRp?: number } =>
  differenceRp === undefined ? { ok: false, code, message } : { ok: false, code, message, differenceRp };

/** Thrown inside a transaction to roll back and report a business error. */
class Rejected extends Error {
  constructor(readonly result: ReturnType<typeof fail>) {
    super(result.message);
  }
}

/**
 * Opens and closes shifts and records cash in/out. One open shift per device; every write is one
 * transaction with its audit row (Req 2.1, 2.3, 2.4, 2.6, 2.9, 2.10).
 */
export class ShiftService {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly deps: ShiftServiceDeps) {}

  /** Restores the open shift and its cash entries after a restart (Req 2.8). */
  current(): Promise<OpenShiftView | null> {
    return this.deps.uow.transact(async (tx) => {
      const shift = await tx.shifts.findOpen();
      return shift ? { shift, entries: await tx.shifts.entries(shift.id) } : null;
    });
  }

  open(actor: ShiftActor, openCashRp: number): Promise<ShiftResult<ShiftRecord>> {
    return this.atomic(async (tx) => {
      const max = this.deps.settings.get("shift.modal_awal_maks");
      if (!Number.isSafeInteger(openCashRp) || openCashRp < 0 || openCashRp > max) {
        throw new Rejected(fail("invalid_input", `Modal awal harus bilangan bulat Rupiah 0 sampai ${max}.`));
      }
      if (await tx.shifts.findOpen()) throw new Rejected(fail("already_open", "Sudah ada Shift yang terbuka di perangkat ini."));
      const shift: ShiftRecord = {
        id: this.deps.ids.next(), openedBy: actor.id, openedAt: this.now(), openCashRp, status: "open",
        closedBy: null, closedAt: null, countedCashRp: null, expectedCashRp: null, differenceRp: null, differenceReason: null,
      };
      await tx.shifts.insert(shift);
      await this.audit(tx, actor, "shift.open", shift.id, null, { openCashRp }, null);
      return shift;
    });
  }

  recordCash(actor: ShiftActor, input: CashEntryInput): Promise<ShiftResult<CashEntryRecord>> {
    return this.atomic(async (tx) => {
      const problems = this.cashProblems(input);
      if (problems.length > 0) throw new Rejected(fail("invalid_input", `Isian tidak valid: ${problems.join(", ")}.`));
      const shift = await tx.shifts.findOpen();
      if (!shift) throw new Rejected(fail("no_open_shift", "Tidak ada Shift terbuka. Buka Shift terlebih dahulu."));
      const entry: CashEntryRecord = {
        id: this.deps.ids.next(), shiftId: shift.id, type: input.type, amountRp: input.amountRp,
        reason: input.reason.trim(), recordedAt: this.now(), recordedBy: actor.id,
      };
      await tx.shifts.addEntry(entry);
      await this.audit(tx, actor, input.type === "cash_in" ? "shift.cash_in" : "shift.cash_out", entry.id, null, { amountRp: entry.amountRp }, entry.reason);
      return entry;
    });
  }

  /** Closes the open shift. A non-zero difference needs a reason, otherwise the shift stays open (Req 2.6). */
  close(actor: ShiftActor, input: CloseShiftInput): Promise<ShiftResult<ZReport>> {
    return this.atomic(async (tx) => {
      const counted = validateCountedCash(input.countedCashRp);
      if (counted) throw new Rejected(fail("invalid_input", counted));
      const shift = await tx.shifts.findOpen();
      if (!shift) throw new Rejected(fail("no_open_shift", "Tidak ada Shift terbuka."));
      const closedAt = this.now();
      const [entries, payments, drawerExpenses] = await Promise.all([
        tx.shifts.entries(shift.id), tx.cashFlow.payments(shift.openedAt, closedAt), tx.cashFlow.drawerExpenses(shift.openedAt, closedAt),
      ]);
      const cash = expectedCash({ openCashRp: shift.openCashRp, openedAt: shift.openedAt, closedAt, payments, cashEntries: entries, drawerExpenses });
      const differenceRp = cashDifference(input.countedCashRp, cash.expectedCashRp);
      const reason = (input.differenceReason ?? "").trim();
      const max = this.deps.settings.get("kasir.alasan_maks_karakter");
      if (differenceRp !== 0 && (reason === "" || charLength(reason) > max)) {
        throw new Rejected(fail("reason_required", `Selisih kas ${differenceRp}. Isi alasan selisih 1 sampai ${max} karakter.`, differenceRp));
      }
      const closed: ShiftRecord = {
        ...shift, status: "closed", closedBy: actor.id, closedAt, countedCashRp: input.countedCashRp,
        expectedCashRp: cash.expectedCashRp, differenceRp, differenceReason: differenceRp === 0 ? null : reason,
      };
      await tx.shifts.update(closed);
      await this.audit(tx, actor, "shift.close", shift.id, { status: "open" }, { countedCashRp: closed.countedCashRp, expectedCashRp: closed.expectedCashRp, differenceRp }, closed.differenceReason);
      return buildZReport({ shift: closed, entries, payments, cash });
    });
  }

  private cashProblems(input: CashEntryInput): string[] {
    const max = this.deps.settings.get("shift.kas_masuk_keluar_maks");
    const maxReason = this.deps.settings.get("kasir.alasan_maks_karakter");
    const problems: string[] = [];
    if (input.type !== "cash_in" && input.type !== "cash_out") problems.push("jenis");
    if (!Number.isSafeInteger(input.amountRp) || input.amountRp < 1 || input.amountRp > max) problems.push(`nominal (1 sampai ${max})`);
    const reasonLength = charLength(input.reason.trim());
    if (reasonLength < 1 || reasonLength > maxReason) problems.push(`alasan (1 sampai ${maxReason} karakter)`);
    return problems;
  }

  private now(): string {
    return this.deps.clock.now().toISOString();
  }

  private audit(tx: ShiftTx, actor: ShiftActor, action: string, entityId: string, before: unknown, after: unknown, reason: string | null): Promise<void> {
    return tx.audit.append({
      id: this.deps.ids.next(), actorId: actor.id, approverId: null, action, actionType: null,
      entityType: "shift", entityId, before, after, reason, createdAt: this.now(),
    });
  }

  /** Serialized so two taps cannot both pass the "no open shift" check. */
  private atomic<T>(fn: (tx: ShiftTx) => Promise<T>): Promise<ShiftResult<T>> {
    const attempt = async (): Promise<ShiftResult<T>> => {
      try {
        return { ok: true, value: await this.deps.uow.transact(fn) };
      } catch (e) {
        if (e instanceof Rejected) return e.result;
        return fail("save_failed", "Data Shift tidak tersimpan. Coba lagi.");
      }
    };
    const result = this.queue.then(attempt, attempt);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
