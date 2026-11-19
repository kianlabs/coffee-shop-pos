import { afterEach, describe, expect, it } from "vitest";
import { BACKENDS, createShiftBackend, type ShiftBackend } from "./support/repoBackends";
import { SHIFT_SCENARIOS, USERS, kasir, shiftEnv } from "./support/shiftScenarios";
const open: ShiftBackend[] = [];
afterEach(() => {
  for (const b of open.splice(0)) b.close();
});
async function backend(kind: "memory" | "sql"): Promise<ShiftBackend> {
  const b = await createShiftBackend(kind, USERS);
  open.push(b);
  return b;
}
const SHIFT_NAMES = ["shiftLifecycle", "concurrentOpen", "closeRollback", "shiftRestart"] as const;
describe("shift scenarios run on both backends", () => {
  for (const kind of BACKENDS) {
    it.each(SHIFT_NAMES)(`${kind}: %s`, async (name) => {
      await SHIFT_SCENARIOS[name](await backend(kind));
    });
  }
});
describe("shift contract: memory and SQL give identical results", () => {
  it.each(SHIFT_NAMES)("%s", async (name) => {
    const memory = await SHIFT_SCENARIOS[name](await backend("memory"));
    const sql = await SHIFT_SCENARIOS[name](await backend("sql"));
    expect(sql).toEqual(memory);
  });
});
describe("shift SQL repository", () => {
  it("maps the unique-index violation on a second open shift to already_open", async () => {
    const b = await backend("sql");
    const { shifts } = shiftEnv(b);
    expect((await shifts.open(kasir, 0)).ok).toBe(true);
    expect(await shifts.open(kasir, 0)).toMatchObject({ ok: false, code: "already_open" });
  });
  it("rejects a raw second open insert with the memory store's error shape", async () => {
    const b = await backend("sql");
    const row = { id: "x", openedBy: "u-kasir", openedAt: "t", openCashRp: 0, status: "open" as const, closedBy: null, closedAt: null, countedCashRp: null, expectedCashRp: null, differenceRp: null, differenceReason: null };
    await b.uow.transact((tx) => tx.shifts.insert(row));
    await expect(b.uow.transact((tx) => tx.shifts.insert({ ...row, id: "y" }))).rejects.toThrow(/one open shift per device/);
    expect((await b.uow.transact((tx) => tx.shifts.findOpen()))?.id).toBe("x");
  });
  it("lets a new shift open after the previous one closed", async () => {
    const b = await backend("sql");
    const { shifts } = shiftEnv(b);
    await shifts.open(kasir, 0);
    await shifts.close(kasir, { countedCashRp: 0 });
    expect((await shifts.open(kasir, 1)).ok).toBe(true);
  });
});
