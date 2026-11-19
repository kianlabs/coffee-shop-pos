import { afterEach, describe, expect, it } from "vitest";
import { createCashFlowRepo } from "@/data/repos/cashFlowRepo";
import { createShiftBackend, openMigratedDb, seedUsers, sqlShift, type ShiftBackend } from "./support/repoBackends";
import { USERS, kasir, shiftEnv } from "./support/shiftScenarios";
const FROM = "2026-11-19T08:00:00.000Z";
const TO = "2026-11-19T17:00:00.000Z";
let be: ShiftBackend;
afterEach(() => be.close());
describe("cash flow reader over payments and orders (V12)", () => {
  it("nets the change off cash, keeps other methods, drops voided and out-of-window rows", async () => {
    be = await createShiftBackend("sql", USERS);
    await shiftEnv(be).shifts.open(kasir, 0);
    await be.addCashSale(7_000, "2026-11-19T09:00:00.000Z", 3_000);
    await be.addOtherSale("qris_manual", 20_000, "2026-11-19T09:10:00.000Z");
    await be.addVoidedCashSale(9_000, "2026-11-19T09:20:00.000Z");
    await be.addCashSale(1, "2026-11-19T07:59:59.000Z");
    await be.addDrawerExpense(2_000, "2026-11-19T10:00:00.000Z");
    const flow = await be.uow.transact(async (tx) => ({ p: await tx.cashFlow.payments(FROM, TO), e: await tx.cashFlow.drawerExpenses(FROM, TO) }));
    expect(flow.p.map((p) => [p.method, p.amountRp, p.kind])).toEqual([["cash", 7_000, "sale"], ["qris_manual", 20_000, "sale"]]);
    expect(flow.e).toEqual([{ amountRp: 2_000, recordedAt: "2026-11-19T10:00:00.000Z" }]);
  });
  it("counts a void refund only when the sale was paid before the window", async () => {
    const db = await openMigratedDb();
    await seedUsers(db, ["u-kasir"]);
    const b = sqlShift(db);
    be = b;
    await db.run("INSERT INTO orders (id, receipt_number, idempotency_key, status, subtotal_rp, total_rp, created_at, updated_at) VALUES ('o1','R1','k1','voided',0,0,?,?)", [FROM, FROM]);
    await db.run("INSERT INTO payments (id, order_id, method, amount_rp, status, paid_at, created_at) VALUES ('p1','o1','cash',5000,'voided','2026-11-18T09:00:00.000Z','2026-11-18T09:00:00.000Z')");
    await db.run("INSERT INTO refunds (id, order_id, idempotency_key, kind, amount_rp, method, reason, executed_by, created_at) VALUES ('r1','o1','rk','void',5000,'cash','x','u-kasir','2026-11-19T10:00:00.000Z')");
    expect((await createCashFlowRepo(db).payments(FROM, TO)).map((p) => [p.kind, p.amountRp])).toEqual([["refund", 5_000]]);
  });
});
