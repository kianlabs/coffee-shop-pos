import { describe, expect, it } from "vitest";
import {
  RESTRICTED_ACTIONS,
  ROLES,
  SCREEN_MIN_ROLE,
  SENSITIVE_ACTIONS,
  canApprove,
  canOpenScreen,
  decide,
  hasAtLeast,
  isRestrictedAction,
  isRole,
  isScreen,
  isSensitiveAction,
  minRoleFor,
  type Action,
  type Decision,
  type Role,
  type Screen,
} from "@/domain/permissions";

// Expected decision per action for [kasir, supervisor, owner].
const EXPECTED: Record<Action, [Decision, Decision, Decision]> = {
  void: ["needs_approval", "allow", "allow"],
  refund: ["needs_approval", "allow", "allow"],
  discount_over_limit: ["needs_approval", "allow", "allow"],
  change_price: ["needs_approval", "allow", "allow"],
  change_hpp: ["needs_approval", "allow", "allow"],
  stock_correction: ["needs_approval", "allow", "allow"],
  quick_item: ["needs_approval", "allow", "allow"],
  csv_import_price: ["needs_approval", "allow", "allow"],
  restore_backup: ["needs_approval", "needs_approval", "allow"],
  change_security_setting: ["needs_approval", "needs_approval", "allow"],
  manage_users: ["deny", "deny", "allow"],
  change_settings: ["deny", "deny", "allow"],
  view_audit_log: ["deny", "deny", "allow"],
  delete_customer: ["deny", "deny", "allow"],
  toggle_payment_method: ["deny", "deny", "allow"],
};

const pairs = (Object.keys(EXPECTED) as Action[]).flatMap((action) =>
  ROLES.map((role, i) => [role, action, EXPECTED[action][i]] as const),
);

describe("decide", () => {
  it("covers every action in the policy", () => {
    const all = [...Object.keys(SENSITIVE_ACTIONS), ...Object.keys(RESTRICTED_ACTIONS)].sort();
    expect(Object.keys(EXPECTED).sort()).toEqual(all);
  });
  it.each(pairs)("%s × %s → %s", (role, action, expected) => {
    expect(decide(role, action)).toBe(expected);
  });
});

describe("SENSITIVE_ACTIONS", () => {
  it("is the closed list from the design", () => {
    expect(Object.keys(SENSITIVE_ACTIONS).sort()).toEqual(
      [
        "change_hpp",
        "change_price",
        "change_security_setting",
        "csv_import_price",
        "discount_over_limit",
        "quick_item",
        "refund",
        "restore_backup",
        "stock_correction",
        "void",
      ].sort(),
    );
  });
  it("never lets a kasir run or approve a sensitive action", () => {
    for (const action of Object.keys(SENSITIVE_ACTIONS) as Array<keyof typeof SENSITIVE_ACTIONS>) {
      expect(canApprove("kasir", action)).toBe(false);
      expect(canApprove("owner", action)).toBe(true);
      expect(canApprove("supervisor", action)).toBe(minRoleFor(action) === "supervisor");
    }
  });
});

// Expected screen access for [kasir, supervisor, owner].
const SCREENS: Record<Screen, [boolean, boolean, boolean]> = {
  kasir: [true, true, true],
  riwayat: [true, true, true],
  antrean: [true, true, true],
  bantuan: [true, true, true],
  laporan: [false, true, true],
  menu: [false, true, true],
  hpp: [false, true, true],
  stok: [false, true, true],
  backup: [false, true, true],
  pengaturan: [false, true, true],
  pengguna: [false, false, true],
  audit: [false, false, true],
};

describe("canOpenScreen", () => {
  it("covers every screen", () => {
    expect(Object.keys(SCREENS).sort()).toEqual(Object.keys(SCREEN_MIN_ROLE).sort());
  });
  const screenPairs = (Object.keys(SCREENS) as Screen[]).flatMap((screen) =>
    ROLES.map((role, i) => [role, screen, SCREENS[screen][i]] as const),
  );
  it.each(screenPairs)("%s × %s → %s", (role, screen, expected) => {
    expect(canOpenScreen(role, screen)).toBe(expected);
  });
});

describe("guards and rank", () => {
  it("orders roles kasir < supervisor < owner", () => {
    const order: Role[] = ["kasir", "supervisor", "owner"];
    order.forEach((a, i) => order.forEach((b, j) => expect(hasAtLeast(a, b)).toBe(i >= j)));
  });
  it("narrows unknown strings", () => {
    expect(isRole("owner")).toBe(true);
    expect(isRole("admin")).toBe(false);
    expect(isRole("toString")).toBe(false);
    expect(isRole(1)).toBe(false);
    expect(isSensitiveAction("refund")).toBe(true);
    expect(isSensitiveAction("manage_users")).toBe(false);
    expect(isRestrictedAction("manage_users")).toBe(true);
    expect(isRestrictedAction(null)).toBe(false);
    expect(isScreen("audit")).toBe(true);
    expect(isScreen("constructor")).toBe(false);
  });
});
