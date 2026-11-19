import { type PosSettings } from "@/data/settings";
import { t } from "@/services/i18n";

const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 32;

interface SecurityCheckInput {
  saved: PosSettings;
  draft: PosSettings;
  newPin: string;
  currentPin: string;
}

export function hasStoredPin(settings: PosSettings): boolean {
  return settings.voidPinHash !== "" && settings.voidPinSalt !== "";
}

/**
 * Same rules as the old handleSaveSettings: turning off the void PIN or
 * setting a new PIN needs the current PIN when one is stored; a new PIN has at
 * least 4 characters; an active void PIN must have a PIN.
 * Returns an error message, or null when saving may continue.
 */
export async function checkSecurityChange(
  { saved, draft, newPin, currentPin }: SecurityCheckInput,
  verifyPin: (pin: string, settings: PosSettings) => Promise<boolean>,
): Promise<string | null> {
  const pin = newPin.trim();
  const current = currentPin.trim();
  const stored = hasStoredPin(saved);
  const isSecurityChange = (saved.requireVoidPin && !draft.requireVoidPin) || pin !== "";
  if (stored && isSecurityChange) {
    if (current === "") return t("pengaturan.security.currentRequired");
    const ok = await verifyPin(current, saved);
    if (!ok) return t("pengaturan.security.currentWrong");
  }
  if (pin !== "" && pin.length < PIN_MIN_LENGTH) return t("pengaturan.security.tooShort");
  if (draft.requireVoidPin && pin === "" && !stored) return t("pengaturan.security.required");
  return null;
}
