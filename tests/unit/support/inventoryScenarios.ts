import { expect } from "vitest";
import { InventoryService } from "@/services/inventoryService";
import { SettingsService } from "@/services/settingsService";
import { sequentialIds } from "@/testing/memory/settings";
import type { InventoryBackend } from "./repoBackends";
export const INV_USERS = ["u-owner"];
export const owner = { id: "u-owner", role: "owner" } as const;
export function inventoryEnv(be: InventoryBackend) {
  const clock = { now: () => new Date("2026-11-19T08:00:00.000Z") };
  const settings = new SettingsService({ uow: be.settingsUow, clock, ids: sequentialIds("s") });
  return new InventoryService({ uow: be.uow, settings, clock, ids: sequentialIds("i") });
}
async function supplier(service: InventoryService, name = "CV Maju"): Promise<string> {
  const r = await service.addSupplier(owner, { name });
  if (!r.ok) throw new Error(r.message);
  return r.value.id;
}
/** Suppliers: case-insensitive duplicate and per-field validation. */
export async function suppliers(be: InventoryBackend): Promise<unknown> {
  const service = inventoryEnv(be);
  await be.seedIngredients();
  const first = await service.addSupplier(owner, { name: "CV Maju", contact: "0812", note: "kopi" });
  const dup = await service.addSupplier(owner, { name: "  cv MAJU " });
  const bad = await service.addSupplier(owner, { name: "", contact: "c".repeat(101), note: "n".repeat(501) });
  expect(dup).toMatchObject({ ok: false, code: "invalid_input" });
  expect((await be.counts()).suppliers).toBe(1);
  return [first, dup, bad, await be.counts()];
}
/** Purchases: stock, unit cost, rounding, invalid input, unknown references. */
export async function purchases(be: InventoryBackend): Promise<unknown> {
  const service = inventoryEnv(be);
  await be.seedIngredients();
  const sid = await supplier(service);
  const log: unknown[] = [];
  log.push(await service.recordPurchase(owner, { supplierId: sid, ingredientId: "kopi", qtyMilli: 2_000, totalRp: 50_000 }));
  log.push(await service.recordPurchase(owner, { supplierId: sid, ingredientId: "kopi", qtyMilli: 3_000, totalRp: 10_000 }));
  for (const input of [{ qtyMilli: 0, totalRp: 1 }, { qtyMilli: 1.5, totalRp: 1 }, { qtyMilli: 1000, totalRp: 1_000_000_000 }]) {
    log.push(await service.recordPurchase(owner, { supplierId: sid, ingredientId: "kopi", ...input }));
  }
  log.push(await service.recordPurchase(owner, { supplierId: "x", ingredientId: "x", qtyMilli: 1000, totalRp: 1 }));
  log.push(await service.recordPurchase(owner, { supplierId: sid, ingredientId: "susu", qtyMilli: 1000, totalRp: 0 }));
  log.push(await service.stockStatus(), await be.counts());
  return log;
}
/** Waste and stock alerts, including negative stock and unmonitored ingredients. */
export async function wasteAndAlerts(be: InventoryBackend): Promise<unknown> {
  const service = inventoryEnv(be);
  await be.seedIngredients();
  const sid = await supplier(service);
  await service.recordPurchase(owner, { supplierId: sid, ingredientId: "kopi", qtyMilli: 500_001, totalRp: 1 });
  const log: unknown[] = [await service.lowStockAlerts()];
  log.push(await service.recordWaste(owner, { ingredientId: "kopi", qtyMilli: 1, reason: " tumpah " }));
  log.push(await service.recordWaste(owner, { ingredientId: "susu", qtyMilli: 5, reason: "x" }));
  log.push(await service.recordWaste(owner, { ingredientId: "susu", qtyMilli: 0, reason: "x" }));
  log.push(await service.recordWaste(owner, { ingredientId: "susu", qtyMilli: 5, reason: "  " }));
  log.push(await service.lowStockAlerts(), await service.stockStatus());
  return log;
}
/** Stocktake adjusts only the differences and ends at the counted values. */
export async function stocktake(be: InventoryBackend): Promise<unknown> {
  const service = inventoryEnv(be);
  await be.seedIngredients();
  const sid = await supplier(service);
  await service.recordPurchase(owner, { supplierId: sid, ingredientId: "kopi", qtyMilli: 5_000, totalRp: 1 });
  await service.recordPurchase(owner, { supplierId: sid, ingredientId: "susu", qtyMilli: 1_000, totalRp: 1 });
  const log: unknown[] = [await service.completeStocktake(owner, { kopi: 4_200, susu: 1_000 })];
  log.push(await service.completeStocktake(owner, { kopi: -1, nope: 1 }), await service.completeStocktake(owner, {}));
  log.push(await service.stockStatus(), await be.counts());
  return log;
}
/** A failing movement insert rolls back purchase, cost history, stocktake, and audit. */
export async function rollback(be: InventoryBackend): Promise<unknown> {
  const service = inventoryEnv(be);
  await be.seedIngredients();
  const sid = await supplier(service);
  const before = await be.counts();
  await be.breakMovements(true);
  const purchase = await service.recordPurchase(owner, { supplierId: sid, ingredientId: "kopi", qtyMilli: 1000, totalRp: 5 });
  const count = await service.completeStocktake(owner, { kopi: 10, susu: 20 });
  const waste = await service.recordWaste(owner, { ingredientId: "kopi", qtyMilli: 5, reason: "x" });
  await be.breakMovements(false);
  for (const r of [purchase, count, waste]) expect(r).toMatchObject({ ok: false, code: "save_failed" });
  expect(await be.counts()).toEqual(before);
  const status = await service.stockStatus();
  expect(status.every((s) => s.stockMilli === 0)).toBe(true);
  return [purchase, count, waste, status, await be.counts()];
}
/** Stock and suppliers survive re-opening the repositories. */
export async function inventoryRestart(be: InventoryBackend): Promise<unknown> {
  const service = inventoryEnv(be);
  await be.seedIngredients();
  const sid = await supplier(service);
  await service.recordPurchase(owner, { supplierId: sid, ingredientId: "kopi", qtyMilli: 7_000, totalRp: 70_000 });
  await service.recordWaste(owner, { ingredientId: "kopi", qtyMilli: 500, reason: "x" });
  const again = inventoryEnv(be.reopen());
  const status = await again.stockStatus();
  expect(status.find((s) => s.ingredientId === "kopi")?.stockMilli).toBe(6_500);
  const dup = await again.addSupplier(owner, { name: "cv maju" });
  expect(dup).toMatchObject({ ok: false, code: "invalid_input" });
  return [status, dup];
}
export const INVENTORY_SCENARIOS = { suppliers, purchases, wasteAndAlerts, stocktake, rollback, inventoryRestart };
