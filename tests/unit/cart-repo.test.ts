import { afterEach, describe, expect, it } from "vitest";
import { BACKENDS, createShiftBackend, type ShiftBackend } from "./support/repoBackends";
import { SHIFT_SCENARIOS, USERS } from "./support/shiftScenarios";
const open: ShiftBackend[] = [];
afterEach(() => {
  for (const b of open.splice(0)) b.close();
});
async function backend(kind: "memory" | "sql"): Promise<ShiftBackend> {
  const b = await createShiftBackend(kind, USERS);
  open.push(b);
  return b;
}
const NAMES = ["cartPersistence", "holdAndRestore"] as const;
describe("cart and held-order scenarios run on both backends", () => {
  for (const kind of BACKENDS) {
    it.each(NAMES)(`${kind}: %s`, async (name) => {
      await SHIFT_SCENARIOS[name](await backend(kind));
    });
  }
});
describe("cart contract: memory and SQL give identical results", () => {
  it.each(NAMES)("%s", async (name) => {
    const memory = await SHIFT_SCENARIOS[name](await backend("memory"));
    const sql = await SHIFT_SCENARIOS[name](await backend("sql"));
    expect(sql).toEqual(memory);
  });
});
describe("cart SQL repository", () => {
  it("keeps a single active cart row", async () => {
    const b = await backend("sql");
    const cart = { lines: [], orderType: "takeaway" as const, tableNo: "", customerName: "" };
    await b.uow.transact(async (tx) => {
      await tx.carts.save(cart);
      await tx.carts.save({ ...cart, tableNo: "3" });
    });
    expect((await b.uow.transact((tx) => tx.carts.load()))?.tableNo).toBe("3");
    await b.uow.transact((tx) => tx.carts.clear());
    expect(await b.uow.transact((tx) => tx.carts.load())).toBeNull();
  });
});
