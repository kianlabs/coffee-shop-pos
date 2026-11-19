import { PAYMENT_METHODS } from "@/domain/payments";
import { canApprove, decide } from "@/domain/permissions";
import { planRefund, type OrderSnapshot } from "@/domain/refund";
import type { Clock, Ids } from "./ports";
import type { OrderRecord, OrderTx, OrderUnitOfWork, RefundRecord } from "./ports/orders";
import type { RefundCommand, RefundResult } from "./refundTypes";

export interface RefundDeps<T extends OrderTx> {
  uow: OrderUnitOfWork<T>;
  clock: Clock;
  ids: Ids;
  /** Setting `kasir.alasan_maks_karakter`. */
  reasonMaxChars?: number;
}

const FAILED = "Void atau refund tidak tersimpan. Coba lagi.";

/** Thrown inside the transaction so nothing is committed. */
class Rejected extends Error {
  constructor(
    message: string,
    readonly code: "invalid" | "forbidden",
    readonly maxPerLine?: Record<string, number>,
  ) {
    super(message);
  }
}

function snapshot(order: OrderRecord): OrderSnapshot {
  return {
    status: order.status,
    lines: order.lines.map((l) => ({
      lineId: l.lineId,
      qty: l.qty,
      chargeTotalRp: l.chargeTotalRp,
      refundedQty: l.refundedQty,
      consumption: l.consumption,
    })),
  };
}

/** Void and full or partial refund, atomic with stock return and audit (Req 7). */
export class RefundService<T extends OrderTx = OrderTx> {
  constructor(private readonly deps: RefundDeps<T>) {}

  async refund(cmd: RefundCommand): Promise<RefundResult> {
    try {
      return await this.deps.uow.transact((tx) => this.apply(cmd, tx));
    } catch (e) {
      if (e instanceof Rejected) {
        return { ok: false, code: e.code, message: e.message, ...(e.maxPerLine ? { maxPerLine: e.maxPerLine } : {}) };
      }
      return { ok: false, code: "failed", message: FAILED };
    }
  }

  private authorize(cmd: RefundCommand): string {
    const action = cmd.kind === "void" ? "void" : "refund";
    if (decide(cmd.actor.role, action) === "allow") return cmd.actor.id;
    if (cmd.approver && canApprove(cmd.approver.role, action)) return cmd.approver.id;
    throw new Rejected("Aksi ini memerlukan persetujuan supervisor atau owner.", "forbidden");
  }

  private checkInput(cmd: RefundCommand): string {
    const reason = cmd.reason.trim();
    const max = this.deps.reasonMaxChars ?? 200;
    if (reason.length < 1 || reason.length > max) throw new Rejected(`Alasan wajib diisi, maksimal ${max} karakter.`, "invalid");
    if (!(PAYMENT_METHODS as readonly string[]).includes(cmd.method)) throw new Rejected("Metode pengembalian tidak dikenal.", "invalid");
    return reason;
  }

  private async apply(cmd: RefundCommand, tx: T): Promise<RefundResult> {
    const existing = await tx.refunds.findByIdempotencyKey(cmd.idempotencyKey);
    if (existing !== null) return { ok: true, refund: existing, replayed: true };
    const approverId = this.authorize(cmd);
    const reason = this.checkInput(cmd);
    const order = await tx.orders.get(cmd.orderId);
    if (order === null) throw new Rejected("Order tidak ditemukan.", "invalid");
    if (cmd.kind === "void" && order.status !== "completed") {
      throw new Rejected(`Order berstatus ${order.status} tidak dapat di-void.`, "invalid");
    }
    const items = cmd.kind === "void" ? order.lines.map((l) => ({ lineId: l.lineId, qty: l.qty })) : (cmd.items ?? []);
    const plan = planRefund(snapshot(order), { items });
    if (!plan.ok) throw new Rejected(plan.reason, "invalid", plan.maxPerLine);
    const now = this.deps.clock.now().toISOString();
    const refund: RefundRecord = {
      id: this.deps.ids.next(),
      idempotencyKey: cmd.idempotencyKey,
      orderId: order.id,
      kind: cmd.kind === "void" ? "void" : plan.status === "refunded" ? "full" : "partial",
      amountRp: plan.amountRp,
      method: cmd.method,
      reason,
      userId: cmd.actor.id,
      approverId,
      createdAt: now,
      lines: plan.lines,
      resultStatus: cmd.kind === "void" ? "voided" : plan.status,
    };
    await tx.refunds.insert(refund);
    for (const l of plan.lines) {
      const changed = await tx.orders.addRefundedQty(order.id, l.lineId, l.qty);
      if (changed !== 1) throw new Error(`refund: guarded update changed ${changed} rows for line ${l.lineId}`);
    }
    await tx.orders.setStatus(order.id, refund.resultStatus);
    if (cmd.kind === "void") await tx.payments.voidByOrder(order.id);
    await tx.stock.append(
      plan.stockReturns.map((r) => ({
        id: this.deps.ids.next(),
        ingredientId: r.ingredientId,
        type: "return_in",
        qtyMilli: r.qtyMilli,
        referenceType: cmd.kind === "void" ? "order_void" : "order_refund",
        referenceId: refund.id,
        createdAt: now,
      })),
    );
    await tx.outbox.enqueue({ id: this.deps.ids.next(), entityType: "refund", entityId: refund.id, op: "create", createdAt: now });
    await tx.audit.append({
      id: this.deps.ids.next(),
      actorId: cmd.actor.id,
      approverId,
      action: cmd.kind === "void" ? "order.void" : "order.refund",
      actionType: cmd.kind === "void" ? "void" : "refund",
      entityType: "order",
      entityId: order.id,
      before: { status: order.status, totalRp: order.totalRp },
      after: { status: refund.resultStatus, amountRp: refund.amountRp, items: plan.lines },
      reason,
      createdAt: now,
    });
    return { ok: true, refund, replayed: false };
  }
}
