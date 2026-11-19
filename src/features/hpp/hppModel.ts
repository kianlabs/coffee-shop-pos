import { type HppDraft, type HppProductView, type HppVariantView } from "@/data/productRepo";
import { marginFor, type HppMode, type MarginInfo, type VariantHppMode } from "@/domain/hppResolve";

export const PRODUCT_MODES: ReadonlyArray<{ value: HppMode; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "recipe", label: "Resep" },
  { value: "none", label: "Tanpa HPP" },
];

export const VARIANT_MODES: ReadonlyArray<{ value: VariantHppMode; label: string }> = [
  { value: "inherit", label: "Ikut produk" },
  ...PRODUCT_MODES,
];

export function modeLabel(mode: VariantHppMode): string {
  return VARIANT_MODES.find((m) => m.value === mode)?.label ?? mode;
}

/** HPP shown in the editor; mirrors `resolveHpp` (recipe falls back to manual). */
export function draftHpp(mode: HppMode, manualRp: number, recipePerUnitRp: number | null): number {
  if (mode === "manual") return Math.max(0, Math.trunc(manualRp));
  if (mode === "recipe") {
    if (recipePerUnitRp !== null && recipePerUnitRp > 0) return recipePerUnitRp;
    return Math.max(0, Math.trunc(manualRp));
  }
  return 0;
}

export function hppNote(mode: HppMode, manualRp: number, recipePerUnitRp: number | null): string | null {
  if (mode === "recipe" && recipePerUnitRp === null) {
    return "Resep belum ada — angka manual dipakai sebagai cadangan.";
  }
  if (mode === "manual" && manualRp === 0) return "HPP masih 0.";
  return null;
}

/** One editable row: a product or one of its variants. */
export interface HppLine {
  kind: "product" | "variant";
  id: string;
  productId: string;
  productName: string;
  variantName: string | null;
  priceRp: number;
  /** Saved mode of this row ("inherit" only for variants). */
  mode: VariantHppMode;
  manualRp: number;
  /** Mode actually applied after resolving "inherit". */
  effectiveMode: HppMode;
  effectiveManualRp: number;
  recipePerUnitRp: number | null;
  hppRp: number;
  margin: MarginInfo;
  note: string | null;
}

function makeLine(base: Omit<HppLine, "hppRp" | "margin" | "note">): HppLine {
  const hppRp = draftHpp(base.effectiveMode, base.effectiveManualRp, base.recipePerUnitRp);
  return {
    ...base,
    hppRp,
    margin: marginFor(base.priceRp, hppRp),
    note: hppNote(base.effectiveMode, base.effectiveManualRp, base.recipePerUnitRp),
  };
}

/** Product row; `mode`/`manualRp` override the saved values for a live preview. */
export function productLine(
  p: HppProductView,
  mode: HppMode = p.mode,
  manualRp: number = p.manualRp,
): HppLine {
  return makeLine({
    kind: "product",
    id: p.id,
    productId: p.id,
    productName: p.name,
    variantName: null,
    priceRp: p.basePriceRp,
    mode,
    manualRp,
    effectiveMode: mode,
    effectiveManualRp: manualRp,
    recipePerUnitRp: p.recipePerUnitRp,
  });
}

/** Variant row; `mode`/`manualRp` override the saved values for a live preview. */
export function variantLine(
  p: HppProductView,
  v: HppVariantView,
  mode: VariantHppMode = v.mode,
  manualRp: number = v.manualRp,
): HppLine {
  const inherit = mode === "inherit";
  return makeLine({
    kind: "variant",
    id: v.id,
    productId: p.id,
    productName: p.name,
    variantName: v.name,
    priceRp: p.basePriceRp + v.priceDeltaRp,
    mode,
    manualRp,
    effectiveMode: inherit ? p.mode : mode,
    effectiveManualRp: inherit ? p.manualRp : manualRp,
    recipePerUnitRp: v.recipePerUnitRp ?? p.recipePerUnitRp,
  });
}

export function lineLabel(line: Pick<HppLine, "productName" | "variantName">): string {
  return line.variantName ? `${line.productName} · ${line.variantName}` : line.productName;
}

export function buildDraft(line: HppLine, mode: VariantHppMode, manualRp: number): HppDraft | null {
  if (mode === line.mode && manualRp === line.manualRp) return null;
  if (line.kind === "variant") return { kind: "variant", id: line.id, mode, manualRp };
  if (mode === "inherit") return null;
  return { kind: "product", id: line.id, mode, manualRp };
}

export function hppStats(rows: HppProductView[]) {
  let kosong = 0;
  let rugi = 0;
  for (const p of rows) {
    const { hppRp, priceRp } = productLine(p);
    if (hppRp <= 0) kosong += 1;
    if (priceRp - hppRp < 0) rugi += 1;
  }
  return { total: rows.length, kosong, rugi };
}
