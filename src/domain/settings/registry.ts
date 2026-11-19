/** Settings registry types. A definition describes one key: its type, default, and limits. */
export type SettingType = "int" | "bool" | "text" | "enum";

interface BaseDef<K extends string, T> {
  key: K;
  default: T;
  auditable: boolean;
  requiresRestart: boolean;
}

export interface IntDef<K extends string = string> extends BaseDef<K, number> {
  type: "int";
  min: number;
  max: number;
}

export interface BoolDef<K extends string = string> extends BaseDef<K, boolean> {
  type: "bool";
}

export interface TextDef<K extends string = string> extends BaseDef<K, string> {
  type: "text";
  maxLength: number;
}

export interface EnumDef<K extends string = string> extends BaseDef<K, string> {
  type: "enum";
  options: readonly string[];
}

export type SettingDef = IntDef | BoolDef | TextDef | EnumDef;

/** Identity helper that keeps literal key and default types in the definition. */
export function defineSetting<const D extends SettingDef>(def: D): D {
  return def;
}
