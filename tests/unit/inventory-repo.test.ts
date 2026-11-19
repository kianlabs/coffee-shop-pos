import { afterEach, describe, expect, it } from "vitest";
import { INVENTORY_SCENARIOS, INV_USERS } from "./support/inventoryScenarios";
import { BACKENDS, createInventoryBackend, type InventoryBackend } from "./support/repoBackends";
const open: InventoryBackend[] = [];
afterEach(() => {
  for (const b of open.splice(0)) b.close();
});
async function backend(kind: "memory" | "sql"): Promise<InventoryBackend> {
  const b = await createInventoryBackend(kind, INV_USERS);
  open.push(b);
  return b;
}
const NAMES = Object.keys(INVENTORY_SCENARIOS) as Array<keyof typeof INVENTORY_SCENARIOS>;
describe("inventory scenarios run on both backends", () => {
  for (const kind of BACKENDS) {
    it.each(NAMES)(`${kind}: %s`, async (name) => {
      await INVENTORY_SCENARIOS[name](await backend(kind));
    });
  }
});
describe("inventory contract: memory and SQL give identical results", () => {
  it.each(NAMES)("%s", async (name) => {
    const memory = await INVENTORY_SCENARIOS[name](await backend("memory"));
    const sql = await INVENTORY_SCENARIOS[name](await backend("sql"));
    expect(sql).toEqual(memory);
  });
});
