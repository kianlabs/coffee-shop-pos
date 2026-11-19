import { beforeEach, describe, expect, it } from "vitest";
import { sequentialIds } from "@/testing/memory/settings";
import { SensitiveActionGuard, type Authorization } from "@/services/sensitiveActionGuard";
import { createMemoryUserDb, fakeHasher, movableClock, type MemoryUserDb } from "@/testing/memory/users";
import { LIMITS, user } from "./support/authFixtures";
let db: MemoryUserDb;
let guard: SensitiveActionGuard;
const details = { action: "order.refund", entityType: "order", entityId: "o1", before: { a: 1 }, after: { a: 2 }, reason: " salah input " };
beforeEach(() => {
  db = createMemoryUserDb();
  db.users.set("own", user("own", "owner", "1111"));
  db.users.set("sup", user("sup", "supervisor", "2222"));
  db.users.set("ani", user("ani", "kasir", "3333"));
  db.users.set("off", user("off", "supervisor", "4444", { isActive: false }));
  guard = new SensitiveActionGuard({ uow: db.uow, hasher: fakeHasher, clock: movableClock(), ids: sequentialIds("a"), limits: () => LIMITS });
});
async function auth(req: Parameters<SensitiveActionGuard["authorize"]>[0]): Promise<Authorization> {
  const r = await guard.authorize(req);
  if (!r.ok) throw new Error(r.code);
  return r.authorization;
}
describe("authorize", () => {
  it("supervisor and owner need no extra PIN and have no approver", async () => {
    expect((await auth({ action: "refund", actorId: "sup" })).approverId).toBeNull();
    expect((await auth({ action: "restore_backup", actorId: "own" })).approverId).toBeNull();
  });
  it("kasir needs an approver", async () => {
    expect(await guard.authorize({ action: "void", actorId: "ani" })).toMatchObject({ ok: false, code: "approver_required" });
  });
  it("kasir with a supervisor PIN is approved", async () => {
    const a = await auth({ action: "void", actorId: "ani", approver: { userId: "sup", pin: "2222" } });
    expect(a).toMatchObject({ actorId: "ani", approverId: "sup" });
  });
  it("supervisor cannot approve an owner-only action", async () => {
    const r = await guard.authorize({ action: "restore_backup", actorId: "ani", approver: { userId: "sup", pin: "2222" } });
    expect(r).toMatchObject({ ok: false, code: "approver_role" });
    expect(db.users.get("sup")?.failedAttempts).toBe(0);
  });
  it("kasir cannot approve and an inactive or unknown approver fails", async () => {
    expect(await guard.authorize({ action: "void", actorId: "ani", approver: { userId: "ani", pin: "3333" } })).toMatchObject({ code: "approver_role" });
    expect(await guard.authorize({ action: "void", actorId: "ani", approver: { userId: "off", pin: "4444" } })).toMatchObject({ code: "approver_invalid" });
    expect(await guard.authorize({ action: "void", actorId: "ani", approver: { userId: "zz", pin: "1" } })).toMatchObject({ code: "approver_invalid" });
  });
  it("a wrong approver PIN adds to the approver's counter and runs nothing", async () => {
    const r = await guard.authorize({ action: "void", actorId: "ani", approver: { userId: "sup", pin: "0000" } });
    expect(r).toMatchObject({ ok: false, code: "wrong_pin", remainingAttempts: 2 });
    expect(db.users.get("sup")?.failedAttempts).toBe(1);
    expect(db.base.audit).toHaveLength(0);
  });
  it("repeated wrong approver PINs lock the approver, even for the right PIN", async () => {
    for (let i = 0; i < 3; i++) await guard.authorize({ action: "void", actorId: "ani", approver: { userId: "sup", pin: "0000" } });
    expect(await guard.authorize({ action: "void", actorId: "ani", approver: { userId: "sup", pin: "2222" } })).toMatchObject({ code: "locked" });
  });
  it("unknown, inactive, and failing storage", async () => {
    expect(await guard.authorize({ action: "void", actorId: "zz" })).toMatchObject({ code: "actor_invalid" });
    expect(await guard.authorize({ action: "void", actorId: "off" })).toMatchObject({ code: "actor_invalid" });
    const broken = new SensitiveActionGuard({ uow: { transact: () => Promise.reject(new Error("x")) }, hasher: fakeHasher, clock: movableClock(), ids: sequentialIds(), limits: () => LIMITS });
    expect(await broken.authorize({ action: "void", actorId: "sup" })).toMatchObject({ code: "failed" });
  });
});
describe("run and record", () => {
  it("writes exactly one audit row with actor, approver, type, and trimmed reason", async () => {
    const a = await auth({ action: "refund", actorId: "ani", approver: { userId: "own", pin: "1111" } });
    const r = await guard.execute(a, details, async () => 42);
    expect(r).toEqual({ ok: true, value: 42 });
    expect(db.base.audit).toHaveLength(1);
    expect(db.base.audit[0]).toMatchObject({ actorId: "ani", approverId: "own", actionType: "refund", action: "order.refund", reason: "salah input", entityId: "o1" });
  });
  it("empty reason becomes null; supervisor row has no approver", async () => {
    await guard.execute(await auth({ action: "refund", actorId: "sup" }), { ...details, reason: "  " }, async () => 1);
    expect(db.base.audit[0]).toMatchObject({ approverId: null, reason: null });
  });
  it("audit failure undoes the action and says so", async () => {
    const a = await auth({ action: "refund", actorId: "sup" });
    db.base.failAudit = true;
    const r = await guard.execute(a, details, async (tx) => {
      await tx.users.update({ ...user("sup", "supervisor"), displayName: "changed" });
    });
    expect(r).toMatchObject({ ok: false, code: "audit_failed" });
    expect(db.users.get("sup")?.displayName).toBe("sup");
  });
  it("an error inside the action rolls back and propagates without an audit row", async () => {
    const a = await auth({ action: "refund", actorId: "sup" });
    await expect(guard.execute(a, details, async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(db.base.audit).toHaveLength(0);
  });
  it("record refuses an authorization it did not issue", async () => {
    const forged: Authorization = { action: "void", actorId: "ani", actorRole: "supervisor", approverId: null };
    await expect(guard.record({ audit: { append: async () => undefined } }, forged, details)).rejects.toThrow();
    const r = await guard.execute(forged, details, async () => 1);
    expect(r).toMatchObject({ ok: false, code: "audit_failed" });
  });
  it("record can write into a caller's own transaction", async () => {
    const a = await auth({ action: "refund", actorId: "sup" });
    await db.base.uow.transact((tx) => guard.record(tx, a, details));
    expect(db.base.audit).toHaveLength(1);
  });
});
