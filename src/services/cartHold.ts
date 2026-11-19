import type { Clock, Ids } from "./ports";
import type { CartState, HeldOrderRecord, ShiftUnitOfWork } from "./ports/shifts";
import { cartFail, heldLabel, type CartMutation } from "./cartModel";

export interface HoldDeps {
  uow: ShiftUnitOfWork;
  clock: Clock;
  ids: Ids;
}

export type HeldResult = { ok: true; held: HeldOrderRecord } | { ok: false; code: "empty_cart" | "held_limit" | "save_failed"; message: string };
export type RestoreChoice = "hold_current" | "discard_current";
export type RestoreResult = { ok: true; cart: CartState } | Exclude<CartMutation, { ok: true }>;

function makeHeld(deps: HoldDeps, actor: { id: string }, cart: CartState, existing: readonly HeldOrderRecord[]): HeldOrderRecord {
  return {
    id: deps.ids.next(), label: heldLabel(cart, existing), heldBy: actor.id,
    heldAt: deps.clock.now().toISOString(), cart: structuredClone(cart),
  };
}

/** Stores the cart as a held order and clears the saved cart in one transaction (Req 4.4, 4.5). */
export async function holdCart(deps: HoldDeps, actor: { id: string }, cart: CartState, heldMax: number): Promise<HeldResult> {
  if (cart.lines.length === 0) return { ok: false, code: "empty_cart", message: "Keranjang kosong, tidak ada yang ditahan." };
  try {
    const held = await deps.uow.transact(async (tx) => {
      const list = await tx.heldOrders.list();
      if (list.length >= heldMax) return null;
      const record = makeHeld(deps, actor, cart, list);
      await tx.heldOrders.insert(record);
      await tx.carts.clear();
      return record;
    });
    if (!held) return { ok: false, code: "held_limit", message: `Pesanan ditahan sudah mencapai batas ${heldMax}. Lanjutkan atau hapus salah satunya.` };
    return { ok: true, held };
  } catch {
    return { ok: false, code: "save_failed", message: "Pesanan gagal ditahan. Keranjang tidak berubah." };
  }
}

/** Saves the held cart as active, optionally holds the current one, and deletes the held row (Req 4.6, 4.7). */
export async function restoreHeld(
  deps: HoldDeps, actor: { id: string }, heldId: string, current: CartState, choice?: RestoreChoice,
): Promise<RestoreResult> {
  const hasItems = current.lines.length > 0;
  if (hasItems && choice === undefined) {
    return cartFail("active_cart_not_empty", "Keranjang aktif berisi item. Tahan keranjang aktif atau batalkan.");
  }
  try {
    const restored = await deps.uow.transact(async (tx) => {
      const held = await tx.heldOrders.get(heldId);
      if (!held) return null;
      if (hasItems && choice === "hold_current") await tx.heldOrders.insert(makeHeld(deps, actor, current, await tx.heldOrders.list()));
      await tx.carts.save(held.cart);
      await tx.heldOrders.remove(heldId);
      return held.cart;
    });
    if (!restored) return cartFail("not_found", "Pesanan ditahan tidak ditemukan.");
    return { ok: true, cart: restored };
  } catch {
    return cartFail("save_failed", "Pesanan gagal dilanjutkan. Pesanan ditahan tetap tersimpan.");
  }
}
