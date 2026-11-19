/** Settings registry types. A definition describes one key: its type, default, and limits. */

export type SettingType = "int" | "bool" | "text" | "enum" | "multi";

/** Screen groups (Req 28.1). */
export type SettingGroup =
  | "toko"
  | "kasir"
  | "pajak"
  | "pembayaran"
  | "diskon"
  | "struk"
  | "printer"
  | "stok"
  | "shift"
  | "keamanan"
  | "backup"
  | "sinkronisasi"
  | "bahasa"
  | "tampilan";

/** Groups whose changes are written to audit_logs (Req 28.7). */
export const AUDITED_GROUPS: readonly SettingGroup[] = ["pajak", "diskon", "pembayaran", "shift", "stok", "keamanan", "backup"];

export interface Localized {
  id: string;
  en: string;
}

interface BaseDef<K extends string, T> {
  key: K;
  group: SettingGroup;
  label: Localized;
  help: Localized;
  default: T;
  auditable: boolean;
  requiresRestart: boolean;
  /** Owning module id; undefined means core. */
  owner?: string;
}

export interface IntDef<K extends string = string> extends BaseDef<K, number> {
  type: "int";
  min: number;
  max: number;
  /** When set, only these values are accepted (still within min..max). */
  allowed?: readonly number[];
}

export interface BoolDef<K extends string = string> extends BaseDef<K, boolean> {
  type: "bool";
}

export interface TextDef<K extends string = string> extends BaseDef<K, string> {
  type: "text";
  maxLength: number;
  /** `time` means 24-hour HH:mm. */
  format?: "time";
}

export interface EnumDef<K extends string = string> extends BaseDef<K, string> {
  type: "enum";
  options: readonly string[];
}

/** A subset of `options`; the stored value is an array of unique options. */
export interface MultiDef<K extends string = string> extends BaseDef<K, readonly string[]> {
  type: "multi";
  options: readonly string[];
  minSelected: number;
}

export type SettingDef = IntDef | BoolDef | TextDef | EnumDef | MultiDef;

/** Identity helper that keeps literal key and default types in the definition. */
export function defineSetting<const D extends SettingDef>(def: D): D {
  return def;
}
