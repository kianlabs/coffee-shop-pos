/** Shared result type and helpers for domain validators. */
export type ValidationResult<R extends string> = { ok: true } | { ok: false; rule: R; message: string };

export const OK: { ok: true } = { ok: true };

export function fail<R extends string>(rule: R, message: string): { ok: false; rule: R; message: string } {
  return { ok: false, rule, message };
}

/** Length in Unicode code points, so an emoji counts as one character. */
export function charLength(value: string): number {
  return Array.from(value).length;
}

/** Case-insensitive key used for uniqueness checks. */
export function nameKey(value: string): string {
  return value.trim().toLocaleLowerCase("id-ID");
}
