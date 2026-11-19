import { expect } from "vitest";
import { CartService, type AddItemInput, type Scheduler } from "@/services/cartService";
import { SettingsService } from "@/services/settingsService";
import { ShiftService } from "@/services/shiftService";
import { sequentialIds } from "@/testing/memory/settings";
import type { ShiftBackend } from "./repoBackends";
export const USERS = ["u-kasir", "u-owner"];
export const kasir = { id: "u-kasir", role: "kasir" } as const;
const T = (hhmm: string): string => `2026-11-19T${hhmm}:00.000Z`;
export function shiftEnv(be: ShiftBackend, start = T("08:00")) {
  const env = { nowIso: start };
  const clock = { now: () => new Date(env.nowIso) };
  const settings = new SettingsService({ uow: be.settingsUow, clock, ids: sequentialIds("s") });
  const shifts = new ShiftService({ uow: be.uow, settings, clock, ids: sequentialIds("sh") });
  return { env, clock, settings, shifts };
}
/** Opening, double open, cash entries, rejected input, then a close with a difference. */
export async function shiftLifecycle(be: ShiftBackend): Promise<unknown> {
  const { env, shifts } = shiftEnv(be);
  const log: unknown[] = [];
  log.push(await shifts.close(kasir, { countedCashRp: 0 }));
  log.push(await shifts.open(kasir, -1));
  const opened = await shifts.open(kasir, 100_000);
  expect(opened.ok).toBe(true);
  log.push(opened, await shifts.open(kasir, 0));
  log.push(await shifts.recordCash(kasir, { type: "cash_in", amountRp: 0, reason: "x" }));
  env.nowIso = T("09:00");
  log.push(await shifts.recordCash(kasir, { type: "cash_in", amountRp: 10_000, reason: " tambah " }));
  log.push(await shifts.recordCash(kasir, { type: "cash_out", amountRp: 3_000, reason: "parkir" }));
  await be.addCashSale(50_000, T("08:30"));
  await be.addCashSale(7_000, T("08:35"), 3_000);
  await be.addOtherSale("qris_manual", 20_000, T("08:40"));
  await be.addVoidedCashSale(9_000, T("08:41"));
  await be.addCashRefund(5_000, T("08:45"));
  await be.addCashSale(9_999, T("07:00"));
  await be.addDrawerExpense(2_000, T("08:50"));
  log.push(await shifts.current());
  env.nowIso = T("17:00");
  log.push(await shifts.close(kasir, { countedCashRp: 150_000 }));
  log.push(await shifts.close(kasir, { countedCashRp: 150_000, differenceReason: "  kembalian  " }));
  log.push(await shifts.current(), await shifts.open(kasir, 5));
  return log;
}
/** Two simultaneous opens: exactly one wins. */
export async function concurrentOpen(be: ShiftBackend): Promise<unknown> {
  const { shifts } = shiftEnv(be);
  const results = await Promise.all([shifts.open(kasir, 0), shifts.open(kasir, 0)]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  return results.map((r) => (r.ok ? "ok" : r.code));
}
/** Audit failure while closing rolls the whole close back. */
export async function closeRollback(be: ShiftBackend): Promise<unknown> {
  const { env, shifts } = shiftEnv(be);
  await shifts.open(kasir, 0);
  await shifts.recordCash(kasir, { type: "cash_in", amountRp: 500, reason: "a" });
  await be.breakAudit(true);
  env.nowIso = T("18:00");
  const failed = await shifts.close(kasir, { countedCashRp: 500 });
  expect(failed).toMatchObject({ ok: false, code: "save_failed" });
  const failedCash = await shifts.recordCash(kasir, { type: "cash_in", amountRp: 1, reason: "b" });
  expect(failedCash).toMatchObject({ ok: false, code: "save_failed" });
  await be.breakAudit(false);
  const view = await shifts.current();
  expect(view?.shift.status).toBe("open");
  expect(view?.entries).toHaveLength(1);
  return [failed, failedCash, view];
}
/** Open shift and entries come back through new repositories (Req 2.8). */
export async function shiftRestart(be: ShiftBackend): Promise<unknown> {
  const { shifts } = shiftEnv(be);
  await shifts.open(kasir, 5_000);
  await shifts.recordCash(kasir, { type: "cash_in", amountRp: 1_000, reason: "a" });
  await shifts.recordCash(kasir, { type: "cash_out", amountRp: 200, reason: "b" });
  const again = shiftEnv(be.reopen()).shifts;
  const restored = await again.current();
  expect(restored?.shift.openCashRp).toBe(5_000);
  expect(restored?.entries.map((e) => e.type)).toEqual(["cash_in", "cash_out"]);
  return restored;
}
const item = (productId: string, qty = 1, extra: Partial<AddItemInput> = {}): AddItemInput => ({
  productId, variantId: null, modifierIds: [], name: productId, unitPriceRp: 18_000, adjustmentsRp: 0, qty, ...extra,
});
export function cartEnv(be: ShiftBackend) {
  const pending: Array<() => void> = [];
  const warnings: string[] = [];
  const scheduler: Scheduler = { set: (fn) => pending.push(fn) - 1, clear: (h) => void (pending[h as number] = () => undefined) };
  const clock = { now: () => new Date("2026-11-19T08:00:00.000Z") };
  const settings = new SettingsService({ uow: be.settingsUow, clock, ids: sequentialIds("s") });
  const cart = new CartService({ uow: be.uow, settings, clock, ids: sequentialIds("h"), scheduler, onWarning: (m) => warnings.push(m) });
  return { cart, warnings, pending };
}
/** Debounced save, restart restore, clear on empty cart, failed save only warns. */
export async function cartPersistence(be: ShiftBackend): Promise<unknown> {
  const { cart, warnings, pending } = cartEnv(be);
  await shiftEnv(be).shifts.open(kasir, 0);
  cart.addItem(item("kopi", 1));
  cart.setQty("kopi||", 2);
  expect(pending.length).toBeGreaterThan(0);
  await cart.flush();
  cart.addItem(item("teh", 1, { modifierIds: ["b", "a"], note: "less sugar" }));
  cart.setCustomerName("Sari");
  cart.setOrderDiscount({ kind: "amount", rp: 500 });
  await cart.flush();
  const restored = cartEnv(be.reopen()).cart;
  await restored.load();
  expect(restored.state).toEqual(cart.state);
  await be.breakCartSave(true);
  cart.addItem(item("roti"));
  await cart.flush();
  expect(warnings).toHaveLength(1);
  await be.breakCartSave(false);
  const afterFailure = cartEnv(be.reopen()).cart;
  await afterFailure.load();
  expect(afterFailure.state.lines.map((l) => l.productId)).toEqual(["kopi", "teh"]);
  for (const l of [...cart.state.lines]) cart.removeItem(l.key);
  await cart.flush();
  const empty = cartEnv(be.reopen()).cart;
  await empty.load();
  return [restored.state, warnings, empty.state];
}
/** Hold, labels, limit, restore with choices, and failures that leave state untouched. */
export async function holdAndRestore(be: ShiftBackend): Promise<unknown> {
  const { cart } = cartEnv(be);
  await shiftEnv(be).shifts.open(kasir, 0);
  const log: unknown[] = [await cart.hold(kasir)];
  cart.addItem(item("a"));
  cart.setCustomerName("Sari");
  const first = await cart.hold(kasir);
  cart.addItem(item("a"));
  cart.setTable("7");
  log.push(first, await cart.hold(kasir));
  cart.addItem(item("b"));
  const held = await cart.listHeld();
  expect(held.map((h) => h.label)).toEqual(["Sari", "7"]);
  log.push(await cart.restore(kasir, held[0].id));
  log.push(await cart.restore(kasir, held[0].id, "hold_current"), cart.state);
  log.push(await cart.restore(kasir, "nope"));
  await be.breakCartSave(true);
  log.push(await cart.restore(kasir, (await cart.listHeld())[0].id, "discard_current"));
  await be.breakCartSave(false);
  await be.breakHold(true);
  log.push(await cart.hold(kasir), cart.state, await be.heldCount());
  await be.breakHold(false);
  for (let i = 0; i < 25; i++) {
    cart.addItem(item(`x${i}`));
    const r = await cart.hold(kasir);
    log.push(r.ok ? "held" : r.code);
  }
  expect(await be.heldCount()).toBe(20);
  return log;
}
export const SHIFT_SCENARIOS = { shiftLifecycle, concurrentOpen, closeRollback, shiftRestart, cartPersistence, holdAndRestore };
