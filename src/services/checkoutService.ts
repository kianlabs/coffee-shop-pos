import { validatePayments } from "@/domain/payments";
import { computeTotals, type PromoResult, type Totals } from "@/domain/taxEngine";
import { buildOrder, buildPayments, mergePromos, promoMessage, saleMovements, toLineInputs } from "./checkoutBuild";
import type { CheckoutCommand, CheckoutResult } from "./checkoutTypes";
import type { Clock, Ids } from "./ports";
import type { CheckoutExtension, OrderTx, OrderUnitOfWork } from "./ports/orders";

export interface CheckoutDeps<T extends OrderTx> {
  uow: OrderUnitOfWork<T>;
  clock: Clock;
  ids: Ids;
  /** Run in order inside the checkout transaction. */
  extensions?: readonly CheckoutExtension<T>[];
}

const FAILED = "Checkout gagal dan dapat dicoba ulang. Keranjang dan pembayaran dipertahankan.";

/** Thrown inside the transaction so any extension writes roll back too. */
class InvalidCheckout extends Error {}

function invalid(message: string): never {
  throw new InvalidCheckout(message);
}

/**
 * Atomic checkout: totals, payments, order, stock movements, outbox and
 * extension writes commit together or not at all (Req 6.2, 6.8, 6.11).
 */
export class CheckoutService<T extends OrderTx = OrderTx> {
  private readonly extensions: readonly CheckoutExtension<T>[];

  constructor(private readonly deps: CheckoutDeps<T>) {
    this.extensions = deps.extensions ?? [];
  }

  async checkout(cmd: CheckoutCommand): Promise<CheckoutResult> {
    try {
      return await this.deps.uow.transact((tx) => this.place(cmd, tx));
    } catch (e) {
      if (e instanceof InvalidCheckout) return { ok: false, code: "invalid", message: e.message };
      return { ok: false, code: "failed", message: FAILED };
    }
  }

  private async place(cmd: CheckoutCommand, tx: T): Promise<CheckoutResult> {
    const existing = await tx.orders.findByIdempotencyKey(cmd.idempotencyKey);
    if (existing !== null) return { ok: true, order: existing, replayed: true };
    if (cmd.lines.length === 0) return invalid("Keranjang kosong.");
    const promo = mergePromos(await this.collectPromos(cmd, tx));
    if (!promo.ok) return invalid(promoMessage(promo.reason));
    const totals = this.totals(cmd, promo);
    const paid = validatePayments(totals.totalRp, cmd.payments, cmd.paymentConfig);
    if (!paid.ok) return invalid(paid.message);
    const now = this.deps.clock.now();
    const order = buildOrder(cmd, totals, paid.changeRp, this.deps.ids, now);
    const payments = buildPayments(cmd, order.id, this.deps.ids);
    await tx.orders.insert(order);
    await tx.payments.insertMany(payments);
    await tx.stock.append(saleMovements(order, this.deps.ids));
    await tx.outbox.enqueue({
      id: this.deps.ids.next(),
      entityType: "order",
      entityId: order.id,
      op: "create",
      createdAt: order.createdAt,
    });
    for (const ext of this.extensions) await ext.apply?.({ order, payments, now }, tx);
    return { ok: true, order, replayed: false };
  }

  private totals(cmd: CheckoutCommand, promo: PromoResult): Totals {
    try {
      return computeTotals(toLineInputs(cmd.lines), cmd.orderDiscount, promo, cmd.tax);
    } catch (e) {
      if (e instanceof RangeError) return invalid(e.message);
      throw e;
    }
  }

  private async collectPromos(cmd: CheckoutCommand, tx: T): Promise<PromoResult[]> {
    const results: PromoResult[] = [];
    for (const ext of this.extensions) {
      const r = await ext.promo?.(cmd, tx);
      if (r) results.push(r);
    }
    return results;
  }
}
