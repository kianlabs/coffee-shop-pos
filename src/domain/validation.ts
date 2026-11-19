/**
 * Input validators (Req 1.1, 1.11, 9.1, 9.5). Limits come from settings and are
 * passed in. Each rejection names the violated rule so the UI can show it.
 * Modifier group validators live in `validationModifier.ts`.
 */
import { OK, charLength, fail, nameKey, type ValidationResult } from "./validationResult";

export { OK, charLength, fail, nameKey, type ValidationResult } from "./validationResult";

export type DisplayNameRule = "display_name_empty" | "display_name_too_long" | "display_name_taken";

export interface DisplayNameLimits {
  /** `keamanan.nama_pengguna_maks_karakter` */
  maxLength: number;
}

/**
 * Display name: 1..maxLength characters after trimming, unique among active
 * users ignoring case. `otherActiveNames` must exclude the user being edited.
 */
export function validateDisplayName(
  name: string,
  limits: DisplayNameLimits,
  otherActiveNames: readonly string[],
): ValidationResult<DisplayNameRule> {
  const trimmed = name.trim();
  if (trimmed === "") return fail("display_name_empty", "Nama pengguna wajib diisi.");
  if (charLength(trimmed) > limits.maxLength) {
    return fail("display_name_too_long", `Nama pengguna maksimal ${limits.maxLength} karakter.`);
  }
  const key = nameKey(trimmed);
  if (otherActiveNames.some((other) => nameKey(other) === key)) {
    return fail("display_name_taken", `Nama "${trimmed}" sudah dipakai pengguna aktif lain.`);
  }
  return OK;
}

export type PinRule = "pin_not_digits" | "pin_too_short" | "pin_too_long";

export interface PinLimits {
  /** `keamanan.pin_panjang_min` */
  minLength: number;
  /** `keamanan.pin_panjang_maks` */
  maxLength: number;
}

/** PIN: only ASCII digits 0-9, length minLength..maxLength. Never trimmed. */
export function validatePin(pin: string, limits: PinLimits): ValidationResult<PinRule> {
  if (!/^[0-9]*$/.test(pin)) return fail("pin_not_digits", "PIN hanya boleh berisi angka 0–9.");
  const range = `${limits.minLength}–${limits.maxLength} digit`;
  if (pin.length < limits.minLength) return fail("pin_too_short", `PIN minimal ${limits.minLength} digit (${range}).`);
  if (pin.length > limits.maxLength) return fail("pin_too_long", `PIN maksimal ${limits.maxLength} digit (${range}).`);
  return OK;
}

export type PhoneRule = "phone_format" | "phone_too_short" | "phone_too_long";

export interface PhoneLimits {
  /** `pelanggan.telepon_digit_min` */
  minDigits: number;
  /** `pelanggan.telepon_digit_maks` */
  maxDigits: number;
}

/**
 * Optional phone number: empty (after trimming) is accepted. Otherwise an
 * optional leading "+" followed by minDigits..maxDigits digits and nothing else.
 */
export function validatePhone(phone: string, limits: PhoneLimits): ValidationResult<PhoneRule> {
  const trimmed = phone.trim();
  if (trimmed === "") return OK;
  const digits = trimmed.startsWith("+") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9]+$/.test(digits)) {
    return fail("phone_format", 'Nomor telepon hanya boleh berisi angka, dengan awalan "+" opsional.');
  }
  const range = `${limits.minDigits}–${limits.maxDigits} digit`;
  if (digits.length < limits.minDigits) return fail("phone_too_short", `Nomor telepon minimal ${limits.minDigits} digit (${range}).`);
  if (digits.length > limits.maxDigits) return fail("phone_too_long", `Nomor telepon maksimal ${limits.maxDigits} digit (${range}).`);
  return OK;
}

export type TextRule = "text_required" | "text_too_long";

export interface TextLimits {
  maxLength: number;
  /** When true the trimmed text must be non-empty. */
  required: boolean;
  /** Field label used in messages, e.g. "Nama pelanggan". */
  label: string;
}

/**
 * Free text (customer name, notes): trimmed, 0..maxLength characters, or
 * 1..maxLength when required.
 */
export function validateText(text: string, limits: TextLimits): ValidationResult<TextRule> {
  const trimmed = text.trim();
  if (limits.required && trimmed === "") return fail("text_required", `${limits.label} wajib diisi.`);
  if (charLength(trimmed) > limits.maxLength) {
    return fail("text_too_long", `${limits.label} maksimal ${limits.maxLength} karakter.`);
  }
  return OK;
}

export {
  validateModifier,
  validateModifierGroup,
  type ModifierGroupInput,
  type ModifierGroupLimits,
  type ModifierGroupRule,
  type ModifierInput,
  type ModifierLimits,
  type ModifierRule,
} from "./validationModifier";
