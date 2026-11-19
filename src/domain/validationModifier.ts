/**
 * Modifier group and modifier validators (Req 3.1, 3.2, 3.9). Limits come from
 * `katalog.*` settings and are passed in.
 */
import { formatRupiah } from "./money";
import { OK, charLength, fail, nameKey, type ValidationResult } from "./validationResult";

export type ModifierGroupRule =
  | "group_name_empty"
  | "group_name_too_long"
  | "min_choices_range"
  | "max_choices_range"
  | "min_above_max"
  | "modifier_count_range"
  | "max_above_active_modifiers";

export interface ModifierGroupInput {
  name: string;
  minChoices: number;
  maxChoices: number;
  /** All modifiers in the group, active or not. */
  modifierCount: number;
  activeModifierCount: number;
}

export interface ModifierGroupLimits {
  /** `katalog.nama_maks_karakter` */
  nameMaxLength: number;
  /** `katalog.modifier_pilihan_maks` */
  choicesMax: number;
  /** `katalog.modifier_per_grup_maks` */
  modifiersPerGroupMax: number;
}

function inIntRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function validateGroupName(name: string, maxLength: number): ValidationResult<ModifierGroupRule> {
  const trimmed = name.trim();
  if (trimmed === "") return fail("group_name_empty", "Nama grup modifier wajib diisi.");
  if (charLength(trimmed) > maxLength) {
    return fail("group_name_too_long", `Nama grup modifier maksimal ${maxLength} karakter.`);
  }
  return OK;
}

/** Returns the first violated rule, checked in the order of `ModifierGroupRule`. */
export function validateModifierGroup(
  group: ModifierGroupInput,
  limits: ModifierGroupLimits,
): ValidationResult<ModifierGroupRule> {
  const name = validateGroupName(group.name, limits.nameMaxLength);
  if (!name.ok) return name;
  if (!inIntRange(group.minChoices, 0, limits.choicesMax)) {
    return fail("min_choices_range", `Pilihan minimum harus bilangan bulat 0–${limits.choicesMax}.`);
  }
  if (!inIntRange(group.maxChoices, 1, limits.choicesMax)) {
    return fail("max_choices_range", `Pilihan maksimum harus bilangan bulat 1–${limits.choicesMax}.`);
  }
  if (group.minChoices > group.maxChoices) {
    return fail("min_above_max", "Pilihan minimum tidak boleh lebih besar dari pilihan maksimum.");
  }
  if (!inIntRange(group.modifierCount, 1, limits.modifiersPerGroupMax)) {
    return fail("modifier_count_range", `Grup harus berisi 1–${limits.modifiersPerGroupMax} modifier.`);
  }
  if (group.maxChoices > group.activeModifierCount) {
    return fail(
      "max_above_active_modifiers",
      `Pilihan maksimum (${group.maxChoices}) melebihi jumlah modifier aktif (${group.activeModifierCount}).`,
    );
  }
  return OK;
}

export type ModifierRule =
  | "modifier_name_empty"
  | "modifier_name_too_long"
  | "modifier_name_taken"
  | "price_delta_range"
  | "hpp_invalid";

export interface ModifierInput {
  name: string;
  priceDeltaRp: number;
  /** Manual HPP; null when the recipe (or 0) is used instead. */
  hppRp: number | null;
}

export interface ModifierLimits {
  /** `katalog.nama_maks_karakter` */
  nameMaxLength: number;
  /** `katalog.selisih_harga_maks` */
  priceDeltaMax: number;
}

/**
 * Modifier: name 1..nameMaxLength, unique in its group ignoring case
 * (`otherNames` excludes the modifier being edited), integer price delta
 * 0..priceDeltaMax, optional integer HPP ≥ 0.
 */
export function validateModifier(
  modifier: ModifierInput,
  limits: ModifierLimits,
  otherNames: readonly string[],
): ValidationResult<ModifierRule> {
  const trimmed = modifier.name.trim();
  if (trimmed === "") return fail("modifier_name_empty", "Nama modifier wajib diisi.");
  if (charLength(trimmed) > limits.nameMaxLength) {
    return fail("modifier_name_too_long", `Nama modifier maksimal ${limits.nameMaxLength} karakter.`);
  }
  const key = nameKey(trimmed);
  if (otherNames.some((other) => nameKey(other) === key)) {
    return fail("modifier_name_taken", `Modifier "${trimmed}" sudah ada di grup ini.`);
  }
  if (!inIntRange(modifier.priceDeltaRp, 0, limits.priceDeltaMax)) {
    return fail("price_delta_range", `Selisih harga harus bilangan bulat ${formatRupiah(0)}–${formatRupiah(limits.priceDeltaMax)}.`);
  }
  if (modifier.hppRp !== null && !inIntRange(modifier.hppRp, 0, Number.MAX_SAFE_INTEGER)) {
    return fail("hpp_invalid", "HPP modifier harus bilangan bulat ≥ 0.");
  }
  return OK;
}
