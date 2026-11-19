import type { PromoResult, TaxConfig, Totals } from "@/domain/taxEngine";
import { NO_PROMO } from "@/domain/taxEngine";
import type { Clock, Ids } from "./ports";
import type { CartLine, CartState, HeldOrderRecord, OrderType, ShiftTx, ShiftUnitOfWork } from "./ports/shifts";
import { timerScheduler, type Scheduler } from "./scheduler";
import { holdCart, restoreHeld, type HeldResult, type HoldDeps, type RestoreChoice, type RestoreResult } from "./cartHold";
import {
  ORDER_TYPES, cartFail, cartOk, cartTotals, emptyCart, isValidQty, lineKey, validateLabelText, validateTable,
  readCartLimits, type AddItemInput, type CartLimits, type CartMutation,
} from "./cartModel";
import type { SettingsService } from "./settingsService";

export const CART_SAVE_DEBOUNCE_MS = 500;
export type { CartMutation } from "./cartModel";
export type { AddItemInput } from "./cartModel";
export type { Scheduler } from "./scheduler";
export type { HeldResult, RestoreChoice, RestoreResult } from "./cartHold";

export interface CartServiceDeps {
  uow: ShiftUnitOfWork;
  settings: Pick<SettingsService, "get">;
  clock: Clock;
  ids: Ids;
  /** Called when the active cart could not be saved. Checkout stays allowed (Req 4.9). */
  onWarning?: (message: string) => void;
  scheduler?: Scheduler;
}

/**
 * Owns the active cart in memory. Changes are saved after a 500 ms pause; a failed save only warns
 * (Req 4.8, 4.9). Hold and restore are single transactions that leave the cart unchanged on failure.
 */
export class CartService {
  private cart: CartState = emptyCart();
  private timer: unknown = null;
  private readonly scheduler: Scheduler;
  constructor(private readonly deps: CartServiceDeps) {
    this.scheduler = deps.scheduler ?? timerScheduler;
  }

  get state(): CartState {
    return structuredClone(this.cart);
  }

  /** Restores the saved cart after a restart. */
  async load(): Promise<void> {
    try {
      const saved = await this.deps.uow.transact((tx) => tx.carts.load());
      this.cart = saved ?? emptyCart();
    } catch {
      this.warn("Keranjang tersimpan tidak dapat dibaca.");
    }
  }

  totals(cfg: TaxConfig, promo: PromoResult = NO_PROMO): Totals {
    return cartTotals(this.cart, cfg, promo);
  }

  addItem(input: AddItemInput): CartMutation {
    if (!isValidQty(input.qty)) return cartFail("invalid_input", "Jumlah harus bilangan bulat minimal 1.");
    const note = (input.note ?? "").trim();
    const bad = validateLabelText(note, this.limits().noteMax, "Catatan item");
    if (!bad.ok) return bad;
    const key = lineKey(input.productId, input.variantId, input.modifierIds);
    const existing = this.find(key);
    if (existing) existing.qty += input.qty;
    else this.cart.lines.push({ ...input, key, note, modifierIds: [...input.modifierIds] });
    return this.changed();
  }

  removeItem(key: string): CartMutation {
    if (!this.cart.lines.some((l) => l.key === key)) return cartFail("not_found", "Item tidak ada di keranjang.");
    this.cart.lines = this.cart.lines.filter((l) => l.key !== key);
    return this.changed();
  }

  setQty(key: string, qty: number): CartMutation {
    const line = this.find(key);
    if (!line) return cartFail("not_found", "Item tidak ada di keranjang.");
    if (!isValidQty(qty)) return cartFail("invalid_input", "Jumlah harus bilangan bulat minimal 1.");
    line.qty = qty;
    return this.changed();
  }

  setLineNote(key: string, note: string): CartMutation {
    const line = this.find(key);
    if (!line) return cartFail("not_found", "Item tidak ada di keranjang.");
    const bad = validateLabelText(note, this.limits().noteMax, "Catatan item");
    if (!bad.ok) return bad;
    line.note = note.trim();
    return this.changed();
  }

  setOrderType(type: OrderType): CartMutation {
    if (!ORDER_TYPES.includes(type)) return cartFail("invalid_input", "Tipe pesanan tidak dikenal.");
    this.cart.orderType = type;
    if (type !== "dine_in") this.cart.tableNo = "";
    return this.changed();
  }

  setTable(table: string): CartMutation {
    if (this.cart.orderType !== "dine_in") return cartFail("invalid_input", "Nomor meja hanya untuk pesanan makan di tempat.");
    const bad = validateTable(table, this.limits().tableMax);
    if (!bad.ok) return bad;
    this.cart.tableNo = table.trim();
    return this.changed();
  }

  setCustomerName(name: string): CartMutation {
    const bad = validateLabelText(name, this.limits().customerMax, "Nama pelanggan");
    if (!bad.ok) return bad;
    this.cart.customerName = name.trim();
    return this.changed();
  }

  setOrderDiscount(discount: CartState["orderDiscount"]): CartMutation {
    this.cart.orderDiscount = discount;
    return this.changed();
  }

  clear(): void {
    this.cart = emptyCart();
    this.changed();
  }

  /** Saves now, skipping the debounce wait. Failure only warns. */
  async flush(): Promise<void> {
    this.cancelTimer();
    const snapshot = structuredClone(this.cart);
    try {
      await this.deps.uow.transact((tx) => this.persist(tx, snapshot));
    } catch {
      this.warn("Keranjang belum tersimpan. Checkout tetap bisa dilakukan.");
    }
  }

  listHeld(): Promise<HeldOrderRecord[]> {
    return this.deps.uow.transact((tx) => tx.heldOrders.list());
  }

  async hold(actor: { id: string }): Promise<HeldResult> {
    const result = await holdCart(this.hookDeps(), actor, this.cart, this.limits().heldMax);
    if (result.ok) this.reset();
    return result;
  }

  /** Brings a held order back; it is deleted only inside the same transaction that saved the cart (Req 4.6, 4.7). */
  async restore(actor: { id: string }, heldId: string, choice?: RestoreChoice): Promise<RestoreResult> {
    const result = await restoreHeld(this.hookDeps(), actor, heldId, this.cart, choice);
    if (!result.ok) return result;
    this.cancelTimer();
    this.cart = structuredClone(result.cart);
    return { ok: true, cart: this.state };
  }

  private hookDeps(): HoldDeps {
    return { uow: this.deps.uow, clock: this.deps.clock, ids: this.deps.ids };
  }

  private persist(tx: ShiftTx, cart: CartState): Promise<void> {
    return cart.lines.length === 0 ? tx.carts.clear() : tx.carts.save(cart);
  }

  private limits(): CartLimits {
    return readCartLimits(this.deps.settings);
  }

  private find(key: string): CartLine | undefined {
    return this.cart.lines.find((l) => l.key === key);
  }

  private changed(): CartMutation {
    this.cancelTimer();
    this.timer = this.scheduler.set(() => void this.flush(), CART_SAVE_DEBOUNCE_MS);
    return cartOk;
  }

  private reset(): void {
    this.cancelTimer();
    this.cart = emptyCart();
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.scheduler.clear(this.timer);
    this.timer = null;
  }

  private warn(message: string): void {
    this.deps.onWarning?.(message);
  }
}
