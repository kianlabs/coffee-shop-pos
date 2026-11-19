/**
 * Inputs for the migration data hooks. Hooks never read localStorage themselves:
 * the caller reads the legacy strings once and passes them in here.
 */
export interface LegacyInputs {
  /** Raw `pos.settings.v1`. */
  settings: string | null;
  /** Raw `pos.shift.v1`. */
  shift: string | null;
  /** Raw `pos.cart.v1`. */
  cart: string | null;
  /** Raw `pos_held_orders`. */
  held: string | null;
}
export type LegacyKey = keyof LegacyInputs;
export interface HookInputs {
  legacy: LegacyInputs;
  /** ISO timestamp used for rows the hooks create. */
  now(): string;
  /** Records a skipped or corrupt legacy entry. */
  log?(message: string): void;
  /** Removes a legacy localStorage key; called only after the whole migration committed. */
  clear?(key: LegacyKey): void;
}
