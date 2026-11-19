import { beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "@/services/authService";
import { createMemoryUserDb, fakeHasher, movableClock, type MemoryUserDb } from "@/testing/memory/users";
import { LIMITS, user } from "./support/authFixtures";
let db: MemoryUserDb;
let clock: ReturnType<typeof movableClock>;
let auth: AuthService;
const make = () => new AuthService({ uow: db.uow, hasher: fakeHasher, clock, limits: () => LIMITS });
beforeEach(() => {
  db = createMemoryUserDb();
  clock = movableClock();
  db.users.set("ani", user("ani", "kasir", "1234"));
  db.users.set("off", user("off", "kasir", "1234", { isActive: false }));
  auth = make();
});
describe("login", () => {
  it("opens a session and resets the wrong count", async () => {
    await auth.login("ani", "9999");
    const r = await auth.login("ani", "1234");
    expect(r).toMatchObject({ ok: true, session: { userId: "ani", role: "kasir", displayName: "ani" } });
    expect(auth.session()?.userId).toBe("ani");
    expect(db.users.get("ani")?.failedAttempts).toBe(0);
  });
  it("wrong PIN reports remaining attempts and opens no session", async () => {
    const r = await auth.login("ani", "0000");
    expect(r).toMatchObject({ ok: false, code: "wrong_pin", remainingAttempts: 2 });
    expect(auth.session()).toBeNull();
    expect(db.users.get("ani")?.failedAttempts).toBe(1);
  });
  it("locks after the limit and rejects the correct PIN while locked, in storage too", async () => {
    for (let i = 0; i < 3; i++) await auth.login("ani", "0000");
    const locked = await auth.login("ani", "1234");
    expect(locked).toMatchObject({ ok: false, code: "locked", remainingLockMs: 5 * 60_000 });
    if (!locked.ok) expect(locked.message).toContain("5:00");
    expect(db.users.get("ani")?.lockedUntil).toBe(clock.now().getTime() + 5 * 60_000);
    // A new service instance (app restart) sees the same lock.
    expect(await make().login("ani", "1234")).toMatchObject({ code: "locked" });
  });
  it("accepts the correct PIN once the lock has expired", async () => {
    for (let i = 0; i < 3; i++) await auth.login("ani", "0000");
    clock.advance(5 * 60_000);
    expect(await auth.login("ani", "1234")).toMatchObject({ ok: true });
  });
  it("rejects unknown and inactive users", async () => {
    expect(await auth.login("zzz", "1234")).toMatchObject({ ok: false, code: "unknown_user" });
    expect(await auth.login("off", "1234")).toMatchObject({ ok: false, code: "unknown_user" });
  });
  it("reports a storage failure", async () => {
    db.users.set("ani", user("ani", "kasir", "1234"));
    const broken = new AuthService({ uow: { transact: () => Promise.reject(new Error("boom")) }, hasher: fakeHasher, clock, limits: () => LIMITS });
    expect(await broken.login("ani", "1234")).toMatchObject({ ok: false, code: "failed" });
  });
  it("logout clears the session", async () => {
    await auth.login("ani", "1234");
    auth.logout();
    expect(auth.session()).toBeNull();
  });
});
describe("idle lock", () => {
  beforeEach(async () => {
    await auth.login("ani", "1234");
  });
  it("locks after the idle time and keeps the session", () => {
    clock.advance(9 * 60_000);
    expect(auth.checkIdle()).toBe(false);
    clock.advance(60_000);
    expect(auth.checkIdle()).toBe(true);
    expect(auth.session()?.userId).toBe("ani");
  });
  it("touch postpones the lock", () => {
    clock.advance(9 * 60_000);
    auth.touch();
    clock.advance(9 * 60_000);
    expect(auth.checkIdle()).toBe(false);
  });
  it("touch does not unlock", () => {
    auth.lockScreen();
    clock.advance(60_000);
    auth.touch();
    expect(auth.isScreenLocked()).toBe(true);
  });
  it("unlock needs the session user's PIN and counts wrong tries", async () => {
    auth.lockScreen();
    expect(await auth.unlock("0000")).toMatchObject({ ok: false, code: "wrong_pin", remainingAttempts: 2 });
    expect(auth.isScreenLocked()).toBe(true);
    expect(await auth.unlock("1234")).toMatchObject({ ok: true });
    expect(auth.isScreenLocked()).toBe(false);
  });
  it("unlock without a session fails; lockScreen without a session does nothing", async () => {
    auth.logout();
    auth.lockScreen();
    expect(auth.isScreenLocked()).toBe(false);
    expect(await auth.unlock("1234")).toMatchObject({ ok: false, code: "unknown_user" });
    expect(auth.checkIdle()).toBe(false);
  });
});
