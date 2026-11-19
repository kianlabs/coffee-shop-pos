import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthUnitOfWork, createPinHasher, createUserRepo } from "@/data/repos/userRepo";
import { LATEST_VERSION } from "@/data/migration/steps";
import { AuthService } from "@/services/authService";
import { UserAdminService } from "@/services/userAdminService";
import { movableClock } from "@/testing/memory/users";
import { sequentialIds } from "@/testing/memory/settings";
import { migrate, type Db } from "./support/migrationHarness";
import { openSqlJsDb } from "@/testing/sqlJsDb";
import { LIMITS, user } from "./support/authFixtures";
let db: Db;
beforeEach(async () => {
  db = await openSqlJsDb();
  await migrate(db, { settings: null, shift: null, cart: null, held: null }, LATEST_VERSION);
});
afterEach(() => db.close());
describe("UserRepo on migrations V1..V14", () => {
  it("round-trips a user including lock columns", async () => {
    const repo = createUserRepo(db);
    const u = user("u1", "supervisor", "1", { failedAttempts: 2, lockedAt: 10, lockedUntil: 20 });
    await repo.insert(u);
    expect(await repo.get("u1")).toEqual(u);
    expect(await repo.get("none")).toBeNull();
    await repo.update({ ...u, role: "owner", failedAttempts: 0, lockedAt: null, lockedUntil: null });
    expect(await repo.get("u1")).toMatchObject({ role: "owner", lockedUntil: null });
    expect((await repo.list()).map((x) => x.id)).toEqual(["u1"]);
  });
  it("active display names are unique ignoring case", async () => {
    const repo = createUserRepo(db);
    await repo.insert({ ...user("u1", "kasir"), displayName: "Budi" });
    await expect(repo.insert({ ...user("u2", "kasir"), displayName: "BUDI" })).rejects.toThrow();
    await expect(repo.insert({ ...user("u2", "kasir"), displayName: " budi " })).rejects.toThrow();
    await repo.insert({ ...user("u2", "kasir"), displayName: "Ani" });
    await expect(repo.update({ ...user("u2", "kasir"), displayName: "bUdI" })).rejects.toThrow();
  });
  it("an inactive user frees the name, and reactivating clashes", async () => {
    const repo = createUserRepo(db);
    await repo.insert({ ...user("u1", "kasir"), displayName: "Budi", isActive: false });
    await repo.insert({ ...user("u2", "kasir"), displayName: "budi" });
    await expect(repo.update({ ...user("u1", "kasir"), displayName: "Budi", isActive: true })).rejects.toThrow();
  });
  it("stores only the PBKDF2 hash, never the PIN", async () => {
    const clock = movableClock();
    const admin = new UserAdminService({ uow: createAuthUnitOfWork(db), hasher: createPinHasher(1000), clock, ids: sequentialIds("n"), limits: () => LIMITS });
    await createUserRepo(db).insert(user("own", "owner", "x", { pinHash: "p" }));
    const r = await admin.createUser("own", { displayName: "Budi", pin: "482913", role: "kasir" });
    expect(r.ok).toBe(true);
    const rows = await db.query<{ pin_hash: string }>("SELECT pin_hash FROM users WHERE id = 'n-1'");
    expect(rows[0].pin_hash).toMatch(/^pbkdf2\$sha256\$1000\$/);
    expect(JSON.stringify(await db.query("SELECT * FROM audit_logs"))).not.toContain("482913");
  });
  it("login, lockout, and last-owner protection work end to end", async () => {
    const hasher = createPinHasher(1000);
    const uow = createAuthUnitOfWork(db);
    const clock = movableClock();
    const repo = createUserRepo(db);
    await repo.insert(user("own", "owner", "x", { pinHash: await hasher.hash("1234") }));
    const auth = new AuthService({ uow, hasher, clock, limits: () => LIMITS });
    expect(await auth.login("own", "0000")).toMatchObject({ code: "wrong_pin", remainingAttempts: 2 });
    expect((await repo.get("own"))?.failedAttempts).toBe(1);
    expect(await auth.login("own", "1234")).toMatchObject({ ok: true });
    for (let i = 0; i < 3; i++) await auth.login("own", "0000");
    expect(await auth.login("own", "1234")).toMatchObject({ code: "locked" });
    const admin = new UserAdminService({ uow, hasher, clock, ids: sequentialIds("n"), limits: () => LIMITS });
    expect(await admin.deactivate("own", "own")).toMatchObject({ code: "last_owner" });
  });
});
