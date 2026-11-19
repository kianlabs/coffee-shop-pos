import { beforeEach, describe, expect, it } from "vitest";
import { sequentialIds } from "@/testing/memory/settings";
import { UserAdminService } from "@/services/userAdminService";
import { createMemoryUserDb, fakeHasher, movableClock, type MemoryUserDb } from "@/testing/memory/users";
import { LIMITS, user } from "./support/authFixtures";
let db: MemoryUserDb;
let admin: UserAdminService;
beforeEach(() => {
  db = createMemoryUserDb();
  db.users.set("own", user("own", "owner", "1111"));
  db.users.set("sup", user("sup", "supervisor", "2222"));
  db.users.set("ani", user("ani", "kasir", "3333"));
  admin = new UserAdminService({ uow: db.uow, hasher: fakeHasher, clock: movableClock(), ids: sequentialIds("n"), limits: () => LIMITS });
});
describe("createUser", () => {
  it("owner creates a user with a hashed PIN and an audit row without the PIN", async () => {
    const r = await admin.createUser("own", { displayName: "  Budi ", pin: "4321", role: "kasir" });
    expect(r.ok).toBe(true);
    const row = db.users.get("n-1");
    expect(row).toMatchObject({ displayName: "Budi", role: "kasir", pinHash: "h:4321", isActive: true });
    expect(db.base.audit).toHaveLength(1);
    expect(JSON.stringify(db.base.audit)).not.toContain("4321");
  });
  it.each(["sup", "ani"])("%s may not create users and nothing changes", async (actor) => {
    const r = await admin.createUser(actor, { displayName: "Budi", pin: "4321", role: "kasir" });
    expect(r).toMatchObject({ ok: false, code: "forbidden" });
    expect(db.users.size).toBe(3);
  });
  it("rejects a bad name or PIN with the violated rule", async () => {
    expect(await admin.createUser("own", { displayName: " ", pin: "4321", role: "kasir" })).toMatchObject({ code: "invalid", rule: "display_name_empty" });
    expect(await admin.createUser("own", { displayName: "ANI", pin: "4321", role: "kasir" })).toMatchObject({ code: "invalid", rule: "display_name_taken" });
    expect(await admin.createUser("own", { displayName: "Budi", pin: "12", role: "kasir" })).toMatchObject({ code: "invalid", rule: "pin_too_short" });
    expect(await admin.createUser("own", { displayName: "Budi", pin: "12a456", role: "kasir" })).toMatchObject({ rule: "pin_not_digits" });
    expect(await admin.createUser("own", { displayName: "x".repeat(41), pin: "1234", role: "kasir" })).toMatchObject({ rule: "display_name_too_long" });
    expect(await admin.createUser("own", { displayName: "Budi", pin: "1234", role: "boss" as never })).toMatchObject({ rule: "role_unknown" });
    expect(db.users.size).toBe(3);
  });
  it("rolls back when the audit write fails", async () => {
    db.base.failAudit = true;
    expect(await admin.createUser("own", { displayName: "Budi", pin: "4321", role: "kasir" })).toMatchObject({ ok: false, code: "failed" });
    expect(db.users.size).toBe(3);
  });
});
describe("deactivate and changeRole", () => {
  it("protects the only active owner", async () => {
    expect(await admin.deactivate("own", "own")).toMatchObject({ ok: false, code: "last_owner" });
    expect(await admin.changeRole("own", "own", "supervisor")).toMatchObject({ ok: false, code: "last_owner" });
    expect(db.users.get("own")).toMatchObject({ isActive: true, role: "owner" });
  });
  it("allows it once a second owner exists, and again protects the last one", async () => {
    await admin.changeRole("own", "sup", "owner");
    expect((await admin.deactivate("own", "own")).ok).toBe(true);
    expect(await admin.deactivate("sup", "sup")).toMatchObject({ code: "last_owner" });
  });
  it("an inactive owner does not count", async () => {
    db.users.set("old", user("old", "owner", "1", { isActive: false }));
    expect(await admin.deactivate("own", "own")).toMatchObject({ code: "last_owner" });
  });
  it("deactivating twice is a no-op; unknown target and non-owner actor fail", async () => {
    await admin.deactivate("own", "ani");
    expect((await admin.deactivate("own", "ani")).ok).toBe(true);
    expect(db.base.audit).toHaveLength(1);
    expect(await admin.deactivate("own", "nope")).toMatchObject({ code: "not_found" });
    expect(await admin.deactivate("sup", "ani")).toMatchObject({ code: "forbidden" });
    expect(await admin.deactivate("ghost", "ani")).toMatchObject({ code: "forbidden" });
  });
  it("a deactivated name can be reused", async () => {
    await admin.deactivate("own", "ani");
    expect((await admin.createUser("own", { displayName: "ANI", pin: "4321", role: "kasir" })).ok).toBe(true);
  });
  it("changeRole to the same role does nothing; unknown role is invalid", async () => {
    expect((await admin.changeRole("own", "ani", "kasir")).ok).toBe(true);
    expect(db.base.audit).toHaveLength(0);
    expect(await admin.changeRole("own", "ani", "boss" as never)).toMatchObject({ rule: "role_unknown" });
    expect((await admin.changeRole("own", "ani", "supervisor")).ok).toBe(true);
  });
});
describe("changePin", () => {
  it("owner resets another user's PIN and clears the lock", async () => {
    db.users.set("ani", user("ani", "kasir", "3333", { failedAttempts: 3, lockedAt: 1, lockedUntil: 2 ** 40 }));
    expect((await admin.changePin("own", "ani", "7777")).ok).toBe(true);
    expect(db.users.get("ani")).toMatchObject({ pinHash: "h:7777", failedAttempts: 0, lockedUntil: null });
  });
  it("a kasir cannot change another user's PIN", async () => {
    expect(await admin.changePin("ani", "sup", "7777", "3333")).toMatchObject({ code: "forbidden" });
    expect(db.users.get("sup")?.pinHash).toBe("h:2222");
  });
  it("a kasir changes their own PIN with the current PIN; a wrong one keeps its counter", async () => {
    expect(await admin.changePin("ani", "ani", "7777", "0000")).toMatchObject({ code: "wrong_pin" });
    expect(db.users.get("ani")).toMatchObject({ pinHash: "h:3333", failedAttempts: 1 });
    expect((await admin.changePin("ani", "ani", "7777", "3333")).ok).toBe(true);
    expect(db.users.get("ani")?.pinHash).toBe("h:7777");
  });
  it("own change while locked is refused", async () => {
    db.users.set("ani", user("ani", "kasir", "3333", { failedAttempts: 3, lockedAt: 0, lockedUntil: 2 ** 50 }));
    expect(await admin.changePin("ani", "ani", "7777", "3333")).toMatchObject({ code: "locked" });
  });
  it("validates the new PIN and the actor", async () => {
    expect(await admin.changePin("own", "ani", "1")).toMatchObject({ rule: "pin_too_short" });
    expect(await admin.changePin("ghost", "ani", "7777")).toMatchObject({ code: "forbidden" });
    expect(await admin.changePin("own", "nope", "7777")).toMatchObject({ code: "not_found" });
  });
});
