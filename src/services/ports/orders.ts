import type { IngredientQty } from "@/domain/refund";
import type { Rupiah } from "@/domain/money";
import type { PaymentMethodId } from "@/domain/payments";
import type { MovementType } from "@/domain/stockLedger";
import type { PromoResult } from "@/domain/taxEngine";
import type { CheckoutCommand } from "../checkoutTypes";
import type { Tx } from "../ports";

export type OrderRecordStatus = "completed" | "voided" | "partially_refunded" | "refunded";

export interface ModifierSnapshot {
  modifierId: string;
  name: string;
  priceDeltaRp: Rupiah;
}

export interface OrderLineRecord {
  lineId: string;
  /** Cart line key (productId|variantId|modifierIds). */
  key: string;
  productId: string;
  name: string;
  qty: number;
  unitPriceRp: Rupiah;
  adjustmentsRp: Rupiah;
  /** Line total after discounts, tax, service and rounding allocation. */
  chargeTotalRp: Rupiah;
  /** HPP per unit, snapshotted at sale. */
  hppRp: Rupiah;
  modifiers: ModifierSnapshot[];
  /** Consumption of the whole line (all units) in milli units. */
  consumption: IngredientQty[];
  refundedQty: number;
}

export interface OrderRecord {
  id: string;
  idempotencyKey: string;
  status: OrderRecordStatus;
  userId: string;
  createdAt: string;
  subtotalRp: Rupiah;
  discountRp: Rupiah;
  serviceChargeRp: Rupiah;
  taxRp: Rupiah;
  roundingRp: Rupiah;
  totalRp: Rupiah;
  changeRp: Rupiah;
  lines: OrderLineRecord[];
}

export interface OrderStore {
  findByIdempotencyKey(key: string): Promise<OrderRecord | null>;
  get(id: string): Promise<OrderRecord | null>;
  insert(order: OrderRecord): Promise<void>;
  setStatus(id: string, status: OrderRecordStatus): Promise<void>;
  addRefundedQty(orderId: string, lineId: string, qty: number): Promise<void>;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  method: PaymentMethodId;
  amountRp: Rupiah;
  status: "paid" | "voided";
  reference: string | null;
}

export interface PaymentStore {
  insertMany(rows: PaymentRecord[]): Promise<void>;
  listByOrder(orderId: string): Promise<PaymentRecord[]>;
  voidByOrder(orderId: string): Promise<void>;
}

export interface StockMovementRecord {
  id: string;
  ingredientId: string;
  type: MovementType;
  qtyMilli: number;
  referenceType: "order" | "order_void" | "order_refund";
  referenceId: string;
  createdAt: string;
}

/** Stock changes are movements only; a negative balance never blocks a sale (Req 8.9). */
export interface StockStore {
  append(rows: StockMovementRecord[]): Promise<void>;
}

export interface OutboxEntry {
  id: string;
  entityType: "order" | "refund";
  entityId: string;
  op: "create";
  createdAt: string;
}

export interface OutboxStore {
  enqueue(entry: OutboxEntry): Promise<void>;
}

export interface RefundLineRecord {
  lineId: string;
  qty: number;
  amountRp: Rupiah;
}

export interface RefundRecord {
  id: string;
  idempotencyKey: string;
  orderId: string;
  kind: "partial" | "full" | "void";
  amountRp: Rupiah;
  method: PaymentMethodId;
  reason: string;
  userId: string;
  approverId: string;
  createdAt: string;
  lines: RefundLineRecord[];
  /** Order status after this action. */
  resultStatus: OrderRecordStatus;
}

export interface RefundStore {
  findByIdempotencyKey(key: string): Promise<RefundRecord | null>;
  insert(refund: RefundRecord): Promise<void>;
  listByOrder(orderId: string): Promise<RefundRecord[]>;
}

/** Settings and audit stores plus everything checkout and refund write. */
export type OrderTx = Tx & {
  orders: OrderStore;
  payments: PaymentStore;
  stock: StockStore;
  outbox: OutboxStore;
  refunds: RefundStore;
};

export interface OrderUnitOfWork<T extends OrderTx = OrderTx> {
  transact<R>(fn: (tx: T) => Promise<R>): Promise<R>;
}

/** What an extension sees: the order as it is about to be committed. */
export interface CheckoutContext {
  order: OrderRecord;
  payments: PaymentRecord[];
  now: Date;
}

/**
 * Extension point for modules (modifiers, vouchers, queue numbers). Both hooks
 * run inside the checkout transaction; a throw rolls the whole checkout back.
 */
export interface CheckoutExtension<T extends OrderTx = OrderTx> {
  id: string;
  /** Before totals: may contribute promo discounts (e.g. a voucher). */
  promo?(command: CheckoutCommand, tx: T): Promise<PromoResult | null>;
  /** After the order, payments and stock are written, before commit. */
  apply?(ctx: CheckoutContext, tx: T): Promise<void>;
}
