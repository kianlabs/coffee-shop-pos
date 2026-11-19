import id from "@/locales/id.json";
import en from "@/locales/en.json";

export type Locale = "id" | "en";
export type Messages = Record<string, string>;

export const DEFAULT_LOCALE: Locale = "id";

const CATALOGS: Record<Locale, Messages> = { id, en };

let activeLocale: Locale = DEFAULT_LOCALE;

export function setLocale(locale: Locale): void {
  activeLocale = locale;
}

export function getLocale(): Locale {
  return activeLocale;
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

/**
 * Looks up a message: active locale, then Indonesian, then the key itself.
 * Never throws, so a missing translation cannot blank a screen.
 */
export function t(key: string, params: Record<string, string | number> = {}, locale: Locale = activeLocale): string {
  const template = CATALOGS[locale][key] ?? CATALOGS[DEFAULT_LOCALE][key] ?? key;
  return interpolate(template, params);
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** DD/MM/YYYY HH:mm in local time, 24-hour clock, for both locales. */
export function formatDateTime(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Whole-rupiah amount with the locale's thousands separator.
 * id: "Rp 25.000"  en: "Rp 25,000"
 */
export function formatMoney(amountRp: number, locale: Locale = activeLocale): string {
  const separator = locale === "id" ? "." : ",";
  const digits = String(Math.round(Math.abs(amountRp)));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return `${amountRp < 0 ? "-" : ""}Rp ${grouped}`;
}
