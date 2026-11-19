/** Catalog CSV row validation (Req 12.3). Pure: no storage, no clock. */
export const CATALOG_HEADER = ["category", "product", "variant", "price_rp", "hpp_manual_rp"] as const;

export interface CatalogRow {
  category: string;
  product: string;
  variant: string;
  priceRp: number;
  /** null when the HPP cell is empty. */
  hppManualRp: number | null;
}

export interface RowError {
  /** Line in the file; the header is line 1. */
  line: number;
  message: string;
}

export interface ValidatedRow {
  line: number;
  row: CatalogRow;
}

export interface CatalogValidation {
  valid: ValidatedRow[];
  errors: RowError[];
}

/** Identity of a row: category, product and variant names (JSON-encoded so commas cannot collide). */
export function catalogKey(row: Pick<CatalogRow, "category" | "product" | "variant">): string {
  return JSON.stringify([row.category, row.product, row.variant]);
}

export function isCatalogHeader(header: readonly string[] | undefined): boolean {
  return header !== undefined && header.length === CATALOG_HEADER.length && CATALOG_HEADER.every((h, i) => header[i] === h);
}

/** Parses a plain non-negative integer cell; anything else (sign, decimal, spaces, exponent) is rejected. */
function parseMoney(cell: string, label: string, max: number): { value: number } | { error: string } {
  if (!/^\d{1,15}$/.test(cell)) return { error: `${label} harus bilangan bulat Rupiah tanpa titik atau tanda.` };
  const value = Number(cell);
  if (value > max) return { error: `${label} melebihi batas ${max} Rupiah.` };
  return { value };
}

function checkRow(cells: readonly string[], max: number): { row: CatalogRow } | { errors: string[] } {
  if (cells.length !== CATALOG_HEADER.length) {
    return { errors: [`Jumlah kolom ${cells.length}, seharusnya ${CATALOG_HEADER.length}.`] };
  }
  const [category, product, variant, price, hpp] = cells as [string, string, string, string, string];
  const errors: string[] = [];
  if (category.trim() === "") errors.push("Nama kategori wajib diisi.");
  if (product.trim() === "") errors.push("Nama produk wajib diisi.");
  const p = price.trim() === "" ? { error: "Harga wajib diisi." } : parseMoney(price, "Harga", max);
  if ("error" in p) errors.push(p.error);
  const h = hpp === "" ? { value: null } : parseMoney(hpp, "HPP manual", max);
  if ("error" in h) errors.push(h.error);
  if (errors.length > 0 || "error" in p || "error" in h) return { errors };
  return { row: { category, product, variant, priceRp: p.value, hppManualRp: h.value } };
}

/**
 * Validates every data row. `records` excludes the header, so record i sits on line i + 2.
 * A repeated category/product/variant is an error on the later row.
 */
export function validateCatalogRows(records: readonly (readonly string[])[], maxPriceRp: number): CatalogValidation {
  const valid: ValidatedRow[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();
  records.forEach((cells, i) => {
    const line = i + 2;
    const result = checkRow(cells, maxPriceRp);
    if ("errors" in result) {
      for (const message of result.errors) errors.push({ line, message });
      return;
    }
    const key = catalogKey(result.row);
    const first = seen.get(key);
    if (first !== undefined) {
      errors.push({ line, message: `Kombinasi kategori, produk, dan varian sama dengan baris ${first}.` });
      return;
    }
    seen.set(key, line);
    valid.push({ line, row: result.row });
  });
  return { valid, errors };
}
