import { afterEach, describe, expect, it } from "vitest";
import { createInventoryBackend, openMigratedDb, seedUsers, sqlInventory, type InventoryBackend } from "./support/repoBackends";
import { inventoryEnv, owner } from "./support/inventoryScenarios";
let be: InventoryBackend;
afterEach(() => be.close());
describe("inventory SQL repository (V11, V13)", () => {
  it("keeps stock in integer milli units that equal the signed movement sum", async () => {
    const db = await openMigratedDb();
    await seedUsers(db, ["u-owner"]);
    be = sqlInventory(db);
    await be.seedIngredients();
    const service = inventoryEnv(be);
    const s = await service.addSupplier(owner, { name: "CV" });
    if (!s.ok) throw new Error(s.message);
    await service.recordPurchase(owner, { supplierId: s.value.id, ingredientId: "kopi", qtyMilli: 2_500, totalRp: 100 });
    await service.recordWaste(owner, { ingredientId: "kopi", qtyMilli: 700, reason: "x" });
    await service.completeStocktake(owner, { kopi: 1_000 });
    const [row] = await db.query<{ stock_milli: number; typ: string }>("SELECT stock_milli, typeof(stock_milli) AS typ FROM ingredients WHERE id = 'kopi'");
    expect(row).toEqual({ stock_milli: 1_000, typ: "integer" });
    const [sum] = await db.query<{ n: number }>(
      "SELECT SUM(CASE WHEN movement_type IN ('purchase_received','adjustment_in') THEN qty_milli ELSE -qty_milli END) AS n FROM stock_movements WHERE ingredient_id = 'kopi'",
    );
    expect(sum.n).toBe(1_000);
    expect(await db.query("PRAGMA foreign_key_check")).toEqual([]);
  });
  it("rejects a purchase for an unknown supplier at the database (foreign keys on)", async () => {
    be = await createInventoryBackend("sql", ["u-owner"]);
    await be.seedIngredients();
    await expect(be.uow.transact((tx) => tx.purchases.insert({ id: "p", supplierId: "nope", ingredientId: "kopi", qtyMilli: 1, totalRp: 1, unitCostRp: 1, purchasedAt: "t", createdBy: "u-owner" }))).rejects.toThrow();
  });
});
