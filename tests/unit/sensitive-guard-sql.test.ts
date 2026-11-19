import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DbPort } from "@/data/dbPort";
import { createAuthUnitOfWork, createPinHasher, createUserRepo } from "@/data/repos/userRepo";
import { LATEST_VERSION } from "@/data/migration/steps";
import { SensitiveActionGuard } from "@/services/sensitiveActionGuard";
import { movableClock } from "@/testing/memory/users";
import { sequentialIds } from "@/testing/memory/settings";
import { migrate, type Db } from "./support/migrationHarness";
import { openSqlJsDb } from "@/testing/sqlJsDb";
import { LIMITS, user } from "./support/authFixtures";
let db: Db;
let failAudit = false;
/** Fails audit inserts on demand; everything else passes through. */
const wrapped = (): DbPort => ({
  exec: (s) => db.exec(s),
  run: (s, p) => (failAudit && s.includes("INSERT INTO audit_logs") ? Promise.reject(new Error("audit down")) : db.run(s, p)),
  query: (s, p) => db.query(s, p),
});
beforeEach(async () => {
  failAudit = false;
  db = await openSqlJsDb();
  await migrate(db, { settings: null, shift: null, cart: null, held: null }, LATEST_VERSION);
});
afterEach(() => db.close());
describe("sensitive actions on SQLite", () => {
  const setup = async () => {
    const hasher = createPinHasher(1000);
    const repo = createUserRepo(db);
    await repo.insert({ ...user("sup", "supervisor", "x", { pinHash: await hasher.hash("2222") }), displayName: "Sup" });
    await repo.insert({ ...user("ani", "kasir"), displayName: "Ani" });
    const uow = createAuthUnitOfWork(wrapped());
    return new SensitiveActionGuard({ uow, hasher, clock: movableClock(), ids: sequentialIds("a"), limits: () => LIMITS });
  };
  const details = { action: "order.void", entityType: "order", entityId: "o1", before: null, after: { s: "void" }, reason: "salah" };
  it("commits the action and one audit row together", async () => {
    const guard = await setup();
    const a = await guard.authorize({ action: "void", actorId: "ani", approver: { userId: "sup", pin: "2222" } });
    if (!a.ok) throw new Error(a.code);
    const r = await guard.execute(a.authorization, details, (tx) => tx.users.update({ ...user("ani", "kasir"), displayName: "Ani2" }));
    expect(r.ok).toBe(true);
    expect(await db.query("SELECT actor_id, approver_id, action_type, reason FROM audit_logs")).toEqual([
      { actor_id: "ani", approver_id: "sup", action_type: "void", reason: "salah" },
    ]);
  });
  it("rolls the action back when the audit insert fails", async () => {
    const guard = await setup();
    const a = await guard.authorize({ action: "void", actorId: "sup" });
    if (!a.ok) throw new Error(a.code);
    failAudit = true;
    const r = await guard.execute(a.authorization, details, (tx) => tx.users.update({ ...user("ani", "kasir"), displayName: "Changed" }));
    expect(r).toMatchObject({ ok: false, code: "audit_failed" });
    expect((await createUserRepo(db).get("ani"))?.displayName).toBe("Ani");
    expect(await db.query("SELECT id FROM audit_logs")).toEqual([]);
  });
  it("a wrong approver PIN persists the counter", async () => {
    const guard = await setup();
    await guard.authorize({ action: "void", actorId: "ani", approver: { userId: "sup", pin: "0000" } });
    expect((await createUserRepo(db).get("sup"))?.failedAttempts).toBe(1);
  });
});
