import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { getDb, isNativePlatform } from "./db";
import { getLastCosts, loadIngredients, roundQty } from "./stock";
import { execStatements, runSerializedWrite, withTransaction, type SqlStatement } from "./tx";
import {
  type RecipeDraft,
  type RecipeLineDraft,
  nextRecipeVersion,
  validateRecipeDraft,
} from "../domain/recipe";

export type { RecipeDraft, RecipeLineDraft };

export type IngredientOption = {
  id: string;
  name: string;
  baseUnit: string;
  lastCostRp: number;
};

export type ActiveRecipeLine = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  baseUnit: string;
  qtyPerUnit: number;
  lastCostRp: number;
  lineCostRp: number;
};

export type ActiveRecipe = {
  id: string;
  productId: string;
  variantId: string | null;
  version: number;
  createdAt: string;
  lines: ActiveRecipeLine[];
  totalCostRp: number;
};

function uid(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function rowsOf(res: { values?: unknown[] }): Record<string, unknown>[] {
  return Array.isArray(res.values) ? (res.values as Record<string, unknown>[]) : [];
}

/**
 * Memuat opsi bahan baku beserta harga beli terakhirnya untuk digunakan pada
 * picker dan perhitungan pratinjau resep.
 */
export async function loadIngredientOptions(db?: SQLiteDBConnection): Promise<IngredientOption[]> {
  if (!isNativePlatform()) return [];
  const conn = db ?? (await getDb());
  const ingredients = await loadIngredients(conn);
  const costs = await getLastCosts(
    conn,
    ingredients.map((i) => i.id),
  );
  return ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    baseUnit: i.baseUnit,
    lastCostRp: costs.get(i.id) ?? 0,
  }));
}

/**
 * Memuat resep aktif untuk produk dan/atau varian tertentu beserta baris-baris
 * bahannya dan rincian biaya.
 */
export async function loadRecipeForProduct(
  productId: string,
  variantId: string | null = null,
  db?: SQLiteDBConnection,
): Promise<ActiveRecipe | null> {
  if (!isNativePlatform()) return null;
  const conn = db ?? (await getDb());

  const recipeRes = variantId
    ? await conn.query(
        "SELECT id, product_id, variant_id, version, created_at FROM recipes WHERE product_id = ? AND variant_id = ? AND is_active = 1 LIMIT 1;",
        [productId, variantId],
      )
    : await conn.query(
        "SELECT id, product_id, variant_id, version, created_at FROM recipes WHERE product_id = ? AND variant_id IS NULL AND is_active = 1 LIMIT 1;",
        [productId],
      );

  const recipeRow = rowsOf(recipeRes)[0];
  if (!recipeRow) return null;

  const recipeId = String(recipeRow.id ?? "");
  const version = Number(recipeRow.version ?? 1);
  const createdAt = String(recipeRow.created_at ?? "");

  const itemRes = await conn.query(
    `SELECT ri.id AS id, ri.ingredient_id AS ingredient_id, ri.qty_per_unit AS qty_per_unit,
            i.name AS ingredient_name, i.base_unit AS base_unit
     FROM recipe_items ri
     JOIN ingredients i ON i.id = ri.ingredient_id
     WHERE ri.recipe_id = ?;`,
    [recipeId],
  );

  const itemRows = rowsOf(itemRes);
  const ingredientIds = itemRows.map((r) => String(r.ingredient_id ?? ""));
  const costs = await getLastCosts(conn, ingredientIds);

  let totalCostRp = 0;
  const lines: ActiveRecipeLine[] = itemRows.map((r) => {
    const ingId = String(r.ingredient_id ?? "");
    const qty = Number(r.qty_per_unit ?? 0);
    const lastCostRp = costs.get(ingId) ?? 0;
    const lineCostRp = Math.round(qty * lastCostRp);
    totalCostRp += lineCostRp;
    return {
      id: String(r.id ?? ""),
      ingredientId: ingId,
      ingredientName: String(r.ingredient_name ?? ingId),
      baseUnit: String(r.base_unit ?? ""),
      qtyPerUnit: qty,
      lastCostRp,
      lineCostRp,
    };
  });

  return {
    id: recipeId,
    productId,
    variantId: variantId ?? null,
    version,
    createdAt,
    lines,
    totalCostRp,
  };
}

/**
 * Menyimpan resep secara atomik:
 * 1. Validasi baris resep (qty > 0, tanpa duplikasi bahan, minimal 1 bahan).
 * 2. Nonaktifkan resep aktif sebelumnya untuk produk/varian tersebut.
 * 3. Masukkan resep baru dengan version = versi lama + 1 (atau 1 jika baru).
 * 4. Masukkan baris-baris recipe_items.
 * 5. Catat audit log perubahan resep.
 *
 * Menggunakan runSerializedWrite & withTransaction agar tidak bisa bersinggungan
 * (interleave) dengan checkout atau transaksi penulisan lain.
 */
export async function saveRecipe(draft: RecipeDraft): Promise<{ id: string; version: number }> {
  if (!isNativePlatform()) {
    throw new Error("Penyimpanan resep hanya didukung di aplikasi Android (native SQLite).");
  }

  const validationError = validateRecipeDraft(draft);
  if (validationError) {
    throw new Error(validationError);
  }

  const { productId, variantId, lines } = draft;
  const now = new Date().toISOString();
  const conn = await getDb();

  return await runSerializedWrite(async () => {
    return await withTransaction(conn, async () => {
      // 1. Cari resep aktif saat ini untuk menentukan nomor versi
      const existingRes = variantId
        ? await conn.query(
            "SELECT id, version FROM recipes WHERE product_id = ? AND variant_id = ? AND is_active = 1 LIMIT 1;",
            [productId, variantId],
          )
        : await conn.query(
            "SELECT id, version FROM recipes WHERE product_id = ? AND variant_id IS NULL AND is_active = 1 LIMIT 1;",
            [productId],
          );
      const existingRow = rowsOf(existingRes)[0];
      const oldVersion = existingRow ? Number(existingRow.version) : null;
      const oldId = existingRow ? String(existingRow.id) : null;
      const newVersion = nextRecipeVersion(oldVersion);
      const newRecipeId = uid("rcp");

      const stmts: SqlStatement[] = [];

      // 2. Nonaktifkan resep aktif lama
      if (variantId) {
        stmts.push({
          statement:
            "UPDATE recipes SET is_active = 0 WHERE product_id = ? AND variant_id = ? AND is_active = 1;",
          values: [productId, variantId],
        });
      } else {
        stmts.push({
          statement:
            "UPDATE recipes SET is_active = 0 WHERE product_id = ? AND variant_id IS NULL AND is_active = 1;",
          values: [productId],
        });
      }

      // 3. Masukkan resep baru
      stmts.push({
        statement:
          "INSERT INTO recipes (id, product_id, variant_id, version, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?);",
        values: [newRecipeId, productId, variantId ?? null, newVersion, now],
      });

      // 4. Masukkan recipe_items
      for (const line of lines) {
        const itemId = uid("rcpi");
        stmts.push({
          statement:
            "INSERT INTO recipe_items (id, recipe_id, ingredient_id, qty_per_unit) VALUES (?, ?, ?, ?);",
          values: [itemId, newRecipeId, line.ingredientId, roundQty(line.qtyPerUnit)],
        });
      }

      // 5. Tulis audit log
      const auditId = uid("aud");
      const beforeJson = oldId ? JSON.stringify({ id: oldId, version: oldVersion }) : null;
      const afterJson = JSON.stringify({
        id: newRecipeId,
        productId,
        variantId: variantId ?? null,
        version: newVersion,
        lines: lines.map((l) => ({ ingredientId: l.ingredientId, qtyPerUnit: roundQty(l.qtyPerUnit) })),
      });

      stmts.push({
        statement:
          "INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, before_json, after_json, reason, created_at) VALUES (?, NULL, 'recipe.saved', 'recipe', ?, ?, ?, NULL, ?);",
        values: [auditId, newRecipeId, beforeJson, afterJson, now],
      });

      await execStatements(conn, stmts);

      return { id: newRecipeId, version: newVersion };
    });
  });
}

/**
 * Menghapus/menonaktifkan resep aktif untuk produk/varian tersebut (is_active = 0).
 * Riwayat resep dan bahan (recipes & recipe_items) tidak dihapus permanen.
 */
export async function deleteRecipe(
  productId: string,
  variantId: string | null = null,
): Promise<boolean> {
  if (!isNativePlatform()) {
    throw new Error("Penghapusan resep hanya didukung di aplikasi Android (native SQLite).");
  }
  if (!productId) {
    throw new Error("ID produk wajib diisi.");
  }

  const conn = await getDb();
  const now = new Date().toISOString();

  return await runSerializedWrite(async () => {
    return await withTransaction(conn, async () => {
      const existingRes = variantId
        ? await conn.query(
            "SELECT id, version FROM recipes WHERE product_id = ? AND variant_id = ? AND is_active = 1 LIMIT 1;",
            [productId, variantId],
          )
        : await conn.query(
            "SELECT id, version FROM recipes WHERE product_id = ? AND variant_id IS NULL AND is_active = 1 LIMIT 1;",
            [productId],
          );
      const existingRow = rowsOf(existingRes)[0];
      if (!existingRow) return false;

      const recipeId = String(existingRow.id);
      const version = Number(existingRow.version);

      const stmts: SqlStatement[] = [];

      stmts.push({
        statement: "UPDATE recipes SET is_active = 0 WHERE id = ?;",
        values: [recipeId],
      });

      const auditId = uid("aud");
      stmts.push({
        statement:
          "INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, before_json, after_json, reason, created_at) VALUES (?, NULL, 'recipe.deleted', 'recipe', ?, ?, NULL, 'deactivated', ?);",
        values: [auditId, recipeId, JSON.stringify({ id: recipeId, version }), now],
      });

      await execStatements(conn, stmts);
      return true;
    });
  });
}
