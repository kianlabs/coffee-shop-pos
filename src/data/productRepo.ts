import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { Rupiah } from "../domain/money";
import { calcHppForLine, type RecipeLineInput } from "../domain/hpp";
import {
  clampRupiah,
  isHppMode,
  isVariantHppMode,
  resolveHpp,
  type HppMode,
  type HppResolution,
  type HppSource,
  type VariantHppMode,
} from "../domain/hppResolve";
import { getDb } from "./db";
import { getLastCosts } from "./stock";

type Row = Record<string, unknown>;

function rowsOf(res: { values?: unknown[] }): Row[] {
  return Array.isArray(res.values) ? (res.values as Row[]) : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function hppKey(productId: string, variantId: string | null): string {
  return `${productId}::${variantId ?? ""}`;
}

type RecipeCost = {
  recipeId: string;
  version: number;
  perUnitRp: Rupiah;
  lines: Array<{
    ingredientId: string;
    ingredientName: string;
    qtyPerUnit: number;
    costPerUnitRp: Rupiah;
    lineCostRp: Rupiah;
  }>;
};

type HppCatalog = {
  products: Map<string, { mode: HppMode; manualRp: Rupiah }>;
  variants: Map<string, { productId: string; mode: VariantHppMode; manualRp: Rupiah }>;
  productRecipe: Map<string, RecipeCost>;
  variantRecipe: Map<string, RecipeCost>;
};

async function tableExists(db: SQLiteDBConnection, table: string): Promise<boolean> {
  const res = await db.query(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = ?;",
    [table],
  );
  return num(rowsOf(res)[0]?.c) > 0;
}

async function tableHasColumn(
  db: SQLiteDBConnection,
  table: string,
  column: string,
): Promise<boolean> {
  // Nama tabel/kolom selalu literal internal, tidak pernah dari input user.
  const res = await db.query(`PRAGMA table_info(${table});`);
  return rowsOf(res).some((r) => str(r.name) === column);
}

/** True bila skema HPP (kolom V4 + tabel resep V2) sudah ada. */
export async function hppSchemaExists(db: SQLiteDBConnection): Promise<boolean> {
  if (!(await tableHasColumn(db, "products", "hpp_mode"))) {
    return false;
  }
  return tableExists(db, "recipes");
}

/**
 * Baca konfigurasi HPP + biaya resep sekali jalan.
 *
 * DB versi lama (kolom/tabel belum ada) diperlakukan sebagai default. Begitu
 * skemanya ADA, kegagalan query TIDAK ditelan: checkout harus gagal closed
 * daripada menulis HPP 0/source 'none' yang salah.
 */
async function loadHppCatalog(db: SQLiteDBConnection): Promise<HppCatalog> {
  const products = new Map<string, { mode: HppMode; manualRp: Rupiah }>();
  const variants = new Map<string, { productId: string; mode: VariantHppMode; manualRp: Rupiah }>();
  const productRecipe = new Map<string, RecipeCost>();
  const variantRecipe = new Map<string, RecipeCost>();

  if (await tableHasColumn(db, "products", "hpp_mode")) {
    const productRes = await db.query(
      "SELECT id, hpp_mode, hpp_manual_rp FROM products WHERE is_active = 1;",
    );
    for (const r of rowsOf(productRes)) {
      const mode = isHppMode(str(r.hpp_mode)) ? (str(r.hpp_mode) as HppMode) : "none";
      products.set(str(r.id), { mode, manualRp: clampRupiah(num(r.hpp_manual_rp)) });
    }
  }

  if (await tableHasColumn(db, "product_variants", "hpp_mode")) {
    const variantRes = await db.query(
      "SELECT id, product_id, hpp_mode, hpp_manual_rp FROM product_variants WHERE is_active = 1;",
    );
    for (const r of rowsOf(variantRes)) {
      const raw = str(r.hpp_mode);
      const mode = isVariantHppMode(raw) ? (raw as VariantHppMode) : "inherit";
      variants.set(str(r.id), {
        productId: str(r.product_id),
        mode,
        manualRp: clampRupiah(num(r.hpp_manual_rp)),
      });
    }
  }

  if (!(await tableExists(db, "recipes"))) {
    return { products, variants, productRecipe, variantRecipe };
  }

  const recipeRes = await db.query(
    "SELECT id, product_id, variant_id, version FROM recipes WHERE is_active = 1;",
  );
  const recipeRows = rowsOf(recipeRes);
  if (recipeRows.length === 0) {
    return { products, variants, productRecipe, variantRecipe };
  }

  const itemRes = await db.query(
    `SELECT ri.recipe_id AS recipe_id, ri.ingredient_id AS ingredient_id, i.name AS ingredient_name, ri.qty_per_unit AS qty_per_unit
       FROM recipe_items ri JOIN ingredients i ON i.id = ri.ingredient_id;`,
  );
  const itemsByRecipe = new Map<string, Array<{ ingredientId: string; ingredientName: string; qtyPerUnit: number }>>();
  const ingredientIds = new Set<string>();
  for (const r of rowsOf(itemRes)) {
    const recipeId = str(r.recipe_id);
    const list = itemsByRecipe.get(recipeId) ?? [];
    list.push({
      ingredientId: str(r.ingredient_id),
      ingredientName: str(r.ingredient_name) || str(r.ingredient_id),
      qtyPerUnit: num(r.qty_per_unit),
    });
    itemsByRecipe.set(recipeId, list);
    ingredientIds.add(str(r.ingredient_id));
  }

  // Skema resep ada, jadi kegagalan baca cost history harus terlihat pemanggil.
  const costs = await getLastCosts(db, Array.from(ingredientIds));

  for (const r of recipeRows) {
    const recipeId = str(r.id);
    const items = itemsByRecipe.get(recipeId) ?? [];
    if (items.length === 0) continue;
    const input: RecipeLineInput[] = items.map((i) => ({
      ingredientId: i.ingredientId,
      ingredientName: i.ingredientName,
      qtyPerUnit: i.qtyPerUnit,
      costPerUnitRp: costs.get(i.ingredientId) ?? 0,
    }));
    let computed;
    try {
      computed = calcHppForLine(input);
    } catch {
      continue;
    }
    const cost: RecipeCost = {
      recipeId,
      version: Math.trunc(num(r.version)) || 1,
      perUnitRp: computed.perUnitRp,
      lines: computed.lines.map((l) => ({
        ingredientId: l.ingredientId,
        ingredientName: l.ingredientName,
        qtyPerUnit: l.qtyPerUnit,
        costPerUnitRp: l.costPerUnitRp,
        lineCostRp: l.lineCostRp,
      })),
    };
    const variantId = str(r.variant_id);
    if (variantId) {
      variantRecipe.set(variantId, cost);
    } else {
      productRecipe.set(str(r.product_id), cost);
    }
  }

  return { products, variants, productRecipe, variantRecipe };
}

function effectiveFor(
  catalog: HppCatalog,
  productId: string,
  variantId: string | null,
): { mode: HppMode; manualRp: Rupiah; recipe: RecipeCost | null } {
  const product = catalog.products.get(productId);
  const variant = variantId ? catalog.variants.get(variantId) : undefined;
  const recipe = (variantId ? catalog.variantRecipe.get(variantId) : undefined) ?? catalog.productRecipe.get(productId) ?? null;

  if (variant && variant.mode !== "inherit") {
    return { mode: variant.mode, manualRp: variant.manualRp, recipe };
  }
  return { mode: product?.mode ?? "none", manualRp: product?.manualRp ?? 0, recipe };
}

export type CheckoutHpp = {
  unitHppRp: Rupiah;
  source: HppSource;
  recipeVersion: number | null;
  detailJson: string | null;
};

/** HPP per baris order, dibaca tepat sebelum insert transaksi. */
export async function resolveCheckoutHpp(
  db: SQLiteDBConnection,
  lines: Array<{ productId: string; variantId: string | null }>,
): Promise<Map<string, CheckoutHpp>> {
  const out = new Map<string, CheckoutHpp>();
  const catalog = await loadHppCatalog(db);

  for (const line of lines) {
    const key = hppKey(line.productId, line.variantId);
    if (out.has(key)) continue;
    const eff = effectiveFor(catalog, line.productId, line.variantId);
    const res = resolveHpp(eff.mode, eff.manualRp, eff.recipe ? eff.recipe.perUnitRp : null);
    out.set(key, {
      unitHppRp: res.unitHppRp,
      source: res.source,
      recipeVersion: res.source === "recipe" && eff.recipe ? eff.recipe.version : null,
      detailJson:
        res.source === "recipe" && eff.recipe
          ? JSON.stringify({ version: eff.recipe.version, lines: eff.recipe.lines })
          : null,
    });
  }

  return out;
}

export type HppVariantView = {
  id: string;
  productId: string;
  name: string;
  priceDeltaRp: Rupiah;
  mode: VariantHppMode;
  manualRp: Rupiah;
  recipePerUnitRp: Rupiah | null;
  resolution: HppResolution;
};

export type HppProductView = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  basePriceRp: Rupiah;
  mode: HppMode;
  manualRp: Rupiah;
  recipePerUnitRp: Rupiah | null;
  updatedAt: string | null;
  resolution: HppResolution;
  variants: HppVariantView[];
};

/** Daftar produk + varian lengkap dengan HPP efektif, untuk layar editor. */
export async function loadHppProducts(): Promise<HppProductView[]> {
  const db = await getDb();
  const catalog = await loadHppCatalog(db);

  const productRes = await db.query(
    `SELECT p.id AS id, p.category_id AS category_id, COALESCE(c.name, 'Lainnya') AS category_name,
            p.name AS name, p.base_price_rp AS base_price_rp, p.hpp_updated_at AS hpp_updated_at,
            COALESCE(c.sort_order, 999) AS sort_order
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.is_active = 1
     ORDER BY sort_order ASC, p.name ASC;`,
  );

  const variantRes = await db.query(
    `SELECT id, product_id, name, price_delta_rp FROM product_variants
     WHERE is_active = 1 ORDER BY price_delta_rp ASC;`,
  );

  const variantsByProduct = new Map<string, Array<{ id: string; name: string; priceDeltaRp: Rupiah }>>();
  for (const r of rowsOf(variantRes)) {
    const productId = str(r.product_id);
    const list = variantsByProduct.get(productId) ?? [];
    list.push({ id: str(r.id), name: str(r.name), priceDeltaRp: num(r.price_delta_rp) });
    variantsByProduct.set(productId, list);
  }

  const out: HppProductView[] = [];
  for (const r of rowsOf(productRes)) {
    const id = str(r.id);
    const cfg = catalog.products.get(id) ?? { mode: "none" as HppMode, manualRp: 0 };
    const recipe = catalog.productRecipe.get(id) ?? null;
    const resolution = resolveHpp(cfg.mode, cfg.manualRp, recipe ? recipe.perUnitRp : null);

    const variants: HppVariantView[] = [];
    for (const v of variantsByProduct.get(id) ?? []) {
      const vcfg = catalog.variants.get(v.id) ?? { productId: id, mode: "inherit" as VariantHppMode, manualRp: 0 };
      const vRecipe = catalog.variantRecipe.get(v.id) ?? recipe;
      const vMode: HppMode = vcfg.mode === "inherit" ? cfg.mode : vcfg.mode;
      const vManual = vcfg.mode === "inherit" ? cfg.manualRp : vcfg.manualRp;
      variants.push({
        id: v.id,
        productId: id,
        name: v.name,
        priceDeltaRp: v.priceDeltaRp,
        mode: vcfg.mode,
        manualRp: vcfg.manualRp,
        recipePerUnitRp: vRecipe ? vRecipe.perUnitRp : null,
        resolution: resolveHpp(vMode, vManual, vRecipe ? vRecipe.perUnitRp : null),
      });
    }

    out.push({
      id,
      categoryId: str(r.category_id),
      categoryName: str(r.category_name),
      name: str(r.name),
      basePriceRp: num(r.base_price_rp),
      mode: cfg.mode,
      manualRp: cfg.manualRp,
      recipePerUnitRp: recipe ? recipe.perUnitRp : null,
      updatedAt: str(r.hpp_updated_at) || null,
      resolution,
      variants,
    });
  }

  return out;
}

export type HppDraft =
  | { kind: "product"; id: string; mode: HppMode; manualRp: Rupiah }
  | { kind: "variant"; id: string; mode: VariantHppMode; manualRp: Rupiah };

async function writeAudit(
  db: SQLiteDBConnection,
  entityType: string,
  entityId: string,
  after: Record<string, unknown>,
  now: string,
): Promise<void> {
  await db
    .executeTransaction(
      [
        {
          statement:
            "INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, before_json, after_json, reason, created_at) VALUES (?, NULL, 'hpp.updated', ?, ?, NULL, ?, NULL, ?);",
          values: [`hpp-${entityId}-${Date.now()}`, entityType, entityId, JSON.stringify(after), now],
        },
      ],
      false,
    )
    .catch(() => undefined);
}

/**
 * Simpan sekumpulan perubahan HPP dalam satu transaksi. Baris yang tidak valid
 * ditolak sebelum ada yang ditulis (all-or-nothing).
 */
export async function saveHppDrafts(drafts: HppDraft[]): Promise<number> {
  if (drafts.length === 0) return 0;
  const db = await getDb();
  const now = new Date().toISOString();
  const txn: Array<{ statement: string; values?: unknown[] }> = [];
  const audits: Array<{ entityType: string; entityId: string; after: Record<string, unknown> }> = [];

  for (const d of drafts) {
    if (!d.id) throw new Error("ID produk/varian kosong.");
    const manual = clampRupiah(d.manualRp);
    if (d.kind === "product") {
      if (!isHppMode(d.mode)) throw new Error(`Mode HPP produk tidak dikenal: ${String(d.mode)}`);
      txn.push({
        statement:
          "UPDATE products SET hpp_mode = ?, hpp_manual_rp = ?, hpp_updated_at = ?, updated_at = ? WHERE id = ?;",
        values: [d.mode, manual, now, now, d.id],
      });
      audits.push({ entityType: "product", entityId: d.id, after: { mode: d.mode, manualRp: manual } });
    } else {
      if (!isVariantHppMode(d.mode)) throw new Error(`Mode HPP varian tidak dikenal: ${String(d.mode)}`);
      txn.push({
        statement:
          "UPDATE product_variants SET hpp_mode = ?, hpp_manual_rp = ?, hpp_updated_at = ? WHERE id = ?;",
        values: [d.mode, manual, now, d.id],
      });
      audits.push({ entityType: "product_variant", entityId: d.id, after: { mode: d.mode, manualRp: manual } });
    }
  }

  await db.executeTransaction(txn, false);
  for (const a of audits) {
    await writeAudit(db, a.entityType, a.entityId, a.after, now);
  }
  return txn.length;
}

export async function saveProductHpp(productId: string, mode: HppMode, manualRp: Rupiah): Promise<void> {
  await saveHppDrafts([{ kind: "product", id: productId, mode, manualRp }]);
}

export async function saveVariantHpp(
  variantId: string,
  mode: VariantHppMode,
  manualRp: Rupiah,
): Promise<void> {
  await saveHppDrafts([{ kind: "variant", id: variantId, mode, manualRp }]);
}
