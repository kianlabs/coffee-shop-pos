import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { idleRemainingMs, isIdleExpired } from "@/domain/idleLock";
import { ROLES, type Role } from "@/domain/permissions";
import { sequentialIds } from "@/testing/memory/settings";
import { UserAdminService } from "@/services/userAdminService";
import { createMemoryUserDb, fakeHasher, movableClock } from "@/testing/memory/users";
import { LIMITS, user } from "./support/authFixtures";
describe("idle lock", () => {
  it("expires exactly at the configured minutes and never before", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e12 }), fc.integer({ min: 1, max: 60 }), fc.integer({ min: -1e7, max: 1e8 }), (last, minutes, delta) => {
        const now = last + delta;
        expect(isIdleExpired(last, now, minutes)).toBe(delta >= minutes * 60_000);
        expect(idleRemainingMs(last, now, minutes) === 0).toBe(delta >= minutes * 60_000);
        expect(idleRemainingMs(last, now, minutes)).toBeLessThanOrEqual(minutes * 60_000);
      }),
    );
  });
});
describe("Property: last active owner", () => {
  type Op = { kind: "deactivate" | "demote" | "promote"; target: number; actor: number };
  const op = fc.record({ kind: fc.constantFrom<Op["kind"]>("deactivate", "demote", "promote"), target: fc.nat(3), actor: fc.nat(3) });
  it("at least one active owner survives any sequence of owner operations", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(op, { maxLength: 25 }), async (ops) => {
        const db = createMemoryUserDb();
        const ids = ["u0", "u1", "u2", "u3"];
        db.users.set("u0", user("u0", "owner"));
        db.users.set("u1", user("u1", "owner"));
        db.users.set("u2", user("u2", "supervisor"));
        db.users.set("u3", user("u3", "kasir"));
        const admin = new UserAdminService({ uow: db.uow, hasher: fakeHasher, clock: movableClock(), ids: sequentialIds("n"), limits: () => LIMITS });
        for (const o of ops) {
          const actor = ids[o.actor];
          const target = ids[o.target];
          if (o.kind === "deactivate") await admin.deactivate(actor, target);
          if (o.kind === "demote") await admin.changeRole(actor, target, "kasir");
          if (o.kind === "promote") await admin.changeRole(actor, target, "owner");
          expect([...db.users.values()].filter((u) => u.isActive && u.role === "owner").length).toBeGreaterThanOrEqual(1);
        }
      }),
    );
  });
  it("non-owners never change any user", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom("u2", "u3"), fc.constantFrom<Role>(...ROLES), async (actor, newRole) => {
        const db = createMemoryUserDb();
        db.users.set("u0", user("u0", "owner"));
        db.users.set("u2", user("u2", "supervisor"));
        db.users.set("u3", user("u3", "kasir"));
        const before = structuredClone([...db.users]);
        const admin = new UserAdminService({ uow: db.uow, hasher: fakeHasher, clock: movableClock(), ids: sequentialIds("n"), limits: () => LIMITS });
        await admin.createUser(actor, { displayName: "Zed", pin: "1234", role: "kasir" });
        await admin.deactivate(actor, "u0");
        await admin.changeRole(actor, "u3", newRole);
        await admin.changePin(actor, "u0", "9999");
        expect([...db.users]).toEqual(before);
      }),
    );
  });
});
