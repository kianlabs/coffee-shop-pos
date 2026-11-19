import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CATALOG_HEADER, catalogKey, isCatalogHeader, validateCatalogRows } from "@/domain/catalogCsv";

describe("catalogCsv", () => {
  it("matches only the exact header", () => {
    expect(isCatalogHeader([...CATALOG_HEADER])).toBe(true);
    expect(isCatalogHeader(undefined)).toBe(false);
    expect(isCatalogHeader(["category", "product"])).toBe(false);
    expect(isCatalogHeader(["Category", "product", "variant", "price_rp", "hpp_manual_rp"])).toBe(false);
  });

  it("separates keys that would collide when joined naively", () => {
    expect(catalogKey({ category: "a,b", product: "c", variant: "" })).not.toBe(catalogKey({ category: "a", product: "b,c", variant: "" }));
  });

  it("reports one error per problem with lines starting at 2", () => {
    const r = validateCatalogRows([["", "", "", "", ""], ["A", "B", "", "0", ""], ["A", "B", "", "5", ""]], 100);
    expect(r.valid.map((v) => v.line)).toEqual([3]);
    expect(r.errors.map((e) => e.line)).toEqual([2, 2, 2, 4]);
  });

  it("property: integers in range are accepted and decimals, signs and spaces are rejected", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), (n) => {
        expect(validateCatalogRows([["A", "B", "", String(n), String(n)]], 1000).errors).toEqual([]);
        for (const bad of [`${n}.5`, `-${n + 1}`, ` ${n}`, `${n}e1`, `${n + 1001}`]) {
          expect(validateCatalogRows([["A", "B", "", bad, ""]], 1000).errors.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
