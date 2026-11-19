import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ROLES, SENSITIVE_ACTIONS, canApprove, decide, type Role, type SensitiveAction } from "@/domain/permissions";
import { sequentialIds } from "@/testing/memory/settings";
import { SensitiveActionGuard } from "@/services/sensitiveActionGuard";
import { createMemoryUserDb, fakeHasher, movableClock } from "@/testing/memory/users";
import { LIMITS, user } from "./support/authFixtures";
const role = fc.constantFrom<Role>(...ROLES);
const action = fc.constantFrom<SensitiveAction>(...(Object.keys(SENSITIVE_ACTIONS) as SensitiveAction[]));
describe("Property: sensitive action authorization", () => {
  it("allows exactly per decide/canApprove and writes one audit row only on success", async () => {
    await fc.assert(
      fc.asyncProperty(role, role, action, fc.boolean(), fc.boolean(), async (actorRole, approverRole, act, withApprover, goodPin) => {
        const db = createMemoryUserDb();
        db.users.set("a", user("a", actorRole, "1111"));
        db.users.set("b", user("b", approverRole, "2222"));
        const guard = new SensitiveActionGuard({ uow: db.uow, hasher: fakeHasher, clock: movableClock(), ids: sequentialIds(), limits: () => LIMITS });
        const approver = withApprover ? { userId: "b", pin: goodPin ? "2222" : "0000" } : undefined;
        const r = await guard.authorize({ action: act, actorId: "a", approver });
        const needs = decide(actorRole, act) === "needs_approval";
        const expected = !needs || (withApprover && canApprove(approverRole, act) && goodPin);
        expect(r.ok).toBe(expected);
        if (r.ok) {
          await guard.execute(r.authorization, { action: "x", entityType: "e", entityId: "1", before: null, after: null }, async () => undefined);
          expect(db.base.audit).toHaveLength(1);
          expect(db.base.audit[0].approverId).toBe(needs ? "b" : null);
        } else {
          expect(db.base.audit).toHaveLength(0);
        }
        // A wrong PIN counts against the approver only when the approver may approve.
        const counted = needs && withApprover && !goodPin && canApprove(approverRole, act);
        expect(db.users.get("b")?.failedAttempts).toBe(counted ? 1 : 0);
      }),
    );
  });
});
