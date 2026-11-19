/**
 * Role × action policy (Req 1.6, 1.7, 1.13, 16.2, 16.3). Pure lookups; the
 * AuthService applies them to the session and approver.
 */
export type Role = "kasir" | "supervisor" | "owner";

export const ROLES: readonly Role[] = ["kasir", "supervisor", "owner"];

const ROLE_RANK: Readonly<Record<Role, number>> = { kasir: 0, supervisor: 1, owner: 2 };

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && Object.hasOwn(ROLE_RANK, value);
}

export function hasAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * Closed list of Aksi_Sensitif with the minimum role that may run it without
 * approval. Below that role the action needs an approver with this role.
 * Restore (Req 18.8) and security settings (Req 28.4) need `owner`.
 */
export const SENSITIVE_ACTIONS = {
  void: "supervisor",
  refund: "supervisor",
  discount_over_limit: "supervisor",
  change_price: "supervisor",
  change_hpp: "supervisor",
  stock_correction: "supervisor",
  restore_backup: "owner",
  change_security_setting: "owner",
  quick_item: "supervisor",
  csv_import_price: "supervisor",
} as const satisfies Readonly<Record<string, Role>>;

export type SensitiveAction = keyof typeof SENSITIVE_ACTIONS;

/** Actions with no approval path: below the minimum role they are denied. */
export const RESTRICTED_ACTIONS = {
  manage_users: "owner", // Req 1.7
  change_settings: "owner", // Req 28.4
  view_audit_log: "owner", // Req 20.10
  delete_customer: "owner", // Req 9.6
  toggle_payment_method: "owner", // Req 6.1
} as const satisfies Readonly<Record<string, Role>>;

export type RestrictedAction = keyof typeof RESTRICTED_ACTIONS;

export type Action = SensitiveAction | RestrictedAction;

export type Decision = "allow" | "needs_approval" | "deny";

export function isSensitiveAction(value: unknown): value is SensitiveAction {
  return typeof value === "string" && Object.hasOwn(SENSITIVE_ACTIONS, value);
}

export function isRestrictedAction(value: unknown): value is RestrictedAction {
  return typeof value === "string" && Object.hasOwn(RESTRICTED_ACTIONS, value);
}

export function minRoleFor(action: Action): Role {
  return isSensitiveAction(action) ? SENSITIVE_ACTIONS[action] : RESTRICTED_ACTIONS[action];
}

/**
 * `allow` when the role meets the minimum. Below it a sensitive action needs
 * an approver (Req 1.6) and a restricted action is denied (Req 1.7).
 */
export function decide(role: Role, action: Action): Decision {
  if (hasAtLeast(role, minRoleFor(action))) return "allow";
  return isSensitiveAction(action) ? "needs_approval" : "deny";
}

/** Whether an approver with this role may authorize the sensitive action. */
export function canApprove(approverRole: Role, action: SensitiveAction): boolean {
  return hasAtLeast(approverRole, SENSITIVE_ACTIONS[action]);
}

/** Screens with the minimum role that may open them (Req 16.2, 16.3). */
export const SCREEN_MIN_ROLE = {
  kasir: "kasir",
  riwayat: "kasir",
  antrean: "kasir",
  bantuan: "kasir",
  laporan: "supervisor",
  menu: "supervisor",
  hpp: "supervisor",
  stok: "supervisor",
  backup: "supervisor",
  pengaturan: "supervisor",
  pengguna: "owner",
  audit: "owner",
} as const satisfies Readonly<Record<string, Role>>;

export type Screen = keyof typeof SCREEN_MIN_ROLE;

export function isScreen(value: unknown): value is Screen {
  return typeof value === "string" && Object.hasOwn(SCREEN_MIN_ROLE, value);
}

export function canOpenScreen(role: Role, screen: Screen): boolean {
  return hasAtLeast(role, SCREEN_MIN_ROLE[screen]);
}
