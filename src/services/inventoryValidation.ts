import { charLength, nameKey } from "@/domain/validation";
import type { SupplierRecord } from "./ports/inventory";

/** Field name → Indonesian message. Every invalid field is listed (Req 8.10). */
export type FieldErrors = Record<string, string>;

export const PURCHASE_TOTAL_MAX_RP = 999_999_999;

export function describeFields(errors: FieldErrors): string {
  return `Isian tidak valid: ${Object.values(errors).join(" ")}`;
}

export function textError(label: string, value: string, min: number, max: number): string | null {
  const length = charLength(value.trim());
  if (length >= min && length <= max) return null;
  return min > 0 ? `${label} wajib diisi, maksimal ${max} karakter.` : `${label} maksimal ${max} karakter.`;
}

export interface SupplierLimits {
  nameMax: number;
  contactMax: number;
  noteMax: number;
}

export function supplierErrors(
  input: { name: string; contact: string; note: string }, limits: SupplierLimits, existing: readonly SupplierRecord[],
): FieldErrors {
  const errors: FieldErrors = {};
  const nameProblem = textError("Nama supplier", input.name, 1, limits.nameMax);
  if (nameProblem) errors.name = nameProblem;
  else if (existing.some((s) => nameKey(s.name) === nameKey(input.name))) errors.name = "Nama supplier sudah dipakai.";
  const contact = textError("Kontak", input.contact, 0, limits.contactMax);
  if (contact) errors.contact = contact;
  const note = textError("Catatan", input.note, 0, limits.noteMax);
  if (note) errors.note = note;
  return errors;
}

export function isPositiveMilli(qtyMilli: number): boolean {
  return Number.isSafeInteger(qtyMilli) && qtyMilli > 0;
}

export function isValidTotal(totalRp: number): boolean {
  return Number.isSafeInteger(totalRp) && totalRp >= 0 && totalRp <= PURCHASE_TOTAL_MAX_RP;
}
