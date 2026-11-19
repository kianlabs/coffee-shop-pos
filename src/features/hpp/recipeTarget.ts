import { type HppLine } from "./hppModel";

export interface RecipeTarget {
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  basePriceRp: number;
}

export function recipeTargetFor(line: HppLine): RecipeTarget {
  return {
    productId: line.productId,
    productName: line.productName,
    variantId: line.kind === "variant" ? line.id : null,
    variantName: line.variantName,
    basePriceRp: line.priceRp,
  };
}

export function recipeLabel(target: RecipeTarget): string {
  return `${target.productName}${target.variantName ? ` ${target.variantName}` : ""}`;
}
