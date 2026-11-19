/**
 * Maps the legacy `pos.settings.v1` blob (PosSettings) to dotted registry keys. Pure.
 * Values the registry rejects are dropped so the registry default applies (Req 28.11).
 */
import { settingByKey, type SettingKey } from "./definitions";
import { validateValue } from "./validate";
export interface LegacyImportPlan {
  /** Registry key → value that passed registry validation. */
  values: Partial<Record<SettingKey, unknown>>;
  /** Registry keys whose legacy value was invalid, so the default applies. */
  defaulted: SettingKey[];
  /** Legacy fields with no registry key (kept in localStorage-era code paths). */
  unmapped: string[];
}
/** Legacy fields that have no registry equivalent. Service charge was a flat Rp, the registry uses basis points. */
const UNMAPPED_FIELDS = [
  "serviceChargeRp",
  "requireVoidPin",
  "voidPinHash",
  "voidPinSalt",
  "cashierName",
  "storeName",
  "blockNegativeStock",
  "autoPrint",
  "printLogo",
  "logoBase64",
  "showCashNumpad",
] as const;
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function accept(plan: LegacyImportPlan, key: SettingKey, value: unknown): boolean {
  const def = settingByKey(key);
  if (def === undefined || validateValue(def, value) !== null) {
    plan.defaulted.push(key);
    return false;
  }
  plan.values[key] = value;
  return true;
}
function mapRounding(plan: LegacyImportPlan, step: unknown): void {
  if (step === 0) {
    accept(plan, "pajak.pembulatan_aktif", false);
    return;
  }
  // An invalid step keeps rounding off (registry default) rather than guessing a multiple.
  if (!accept(plan, "pajak.pembulatan_kelipatan", step)) return;
  accept(plan, "pajak.pembulatan_aktif", true);
}
/** `raw` is the parsed `pos.settings.v1` JSON; anything that is not an object yields an empty plan. */
export function mapLegacySettings(raw: unknown): LegacyImportPlan {
  const plan: LegacyImportPlan = { values: {}, defaulted: [], unmapped: [] };
  if (!isRecord(raw)) return plan;
  if ("roundingStep" in raw) mapRounding(plan, raw.roundingStep);
  plan.unmapped = UNMAPPED_FIELDS.filter((f) => f in raw);
  return plan;
}
