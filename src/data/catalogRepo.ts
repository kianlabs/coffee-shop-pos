import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { Catalog, CatalogProduct, Category, ProductVariant } from "../domain/catalog";
import type { Rupiah } from "../domain/money";
import { isNativePlatform } from "./db";
import { getDb } from "./db";
import { runSerializedWrite } from "./tx";
import {
  createCategoryLocal,
  createProductLocal,
  createVariantLocal,
  deactivateProductLocal,
  deactivateVariantLocal,
  loadCatalogLocal,
  updateProductLocal,
  updateVariantLocal,
} from "./catalogStore";

function rowsOf(res: { values?: unknown[] }): Record<string, unknown>[] {
  return Array.isArray(res.values) ? (res.values as Record<string, unknown>[]) : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function uid(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

async function loadCatalogSqlite(): Promise<Catalog> {
  const db = await getDb();
  const catRes = await db.query(
    "SELECT id, name, sort_order FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC;",
  );
  const categories: Category[] = rowsOf(catRes).map((r) => ({
    id: str(r.id),
    name: str(r.name),
    sortOrder: num(r.sort_order),
  }));

  const prodRes = await db.query(
    "SELECT id, category_id, name, base_price_rp FROM products WHERE is_active = 1 ORDER BY name ASC;",
  );
  const varRes = await db.query(
    "SELECT id, product_id, name, price_delta_rp FROM product_variants WHERE is_active = 1 ORDER BY price_delta_rp ASC;",
  );

  const variantsByProduct = new Map<string, ProductVariant[]>();
  for (const r of rowsOf(varRes)) {
    const productId = str(r.product_id);
    const list = variantsByProduct.get(productId) ?? [];
    list.push({
      id: str(r.id),
      productId,
      name: str(r.name),
      priceDeltaRp: num(r.price_delta_rp),
      isActive: true,
    });
    variantsByProduct.set(productId, list);
  }

  const products: CatalogProduct[] = rowsOf(prodRes).map((r) => ({
    id: str(r.id),
    categoryId: str(r.category_id),
    name: str(r.name),
    basePriceRp: num(r.base_price_rp),
    isActive: true,
    variants: variantsByProduct.get(str(r.id)) ?? [],
  }));

  return { categories, products };
}

async function assertCategoryNameFree(db: SQLiteDBConnection, name: string): Promise<void> {
  const res = await db.query("SELECT COUNT(*) AS c FROM categories WHERE LOWER(name) = LOWER(?);", [name]);
  const row = rowsOf(res)[0];
  if (Number(row?.c ?? 0) > 0) {
    throw new Error("Kategori itu sudah ada.");
  }
}

const native = isNativePlatform();

export async function loadCatalog(): Promise<Catalog> {
  if (!native) return loadCatalogLocal();
  return loadCatalogSqlite();
}

export async function createCategory(name: string): Promise<void> {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new Error("Nama kategori wajib diisi.");
  if (!native) {
    createCategoryLocal(clean);
    return;
  }
  const db = await getDb();
  await assertCategoryNameFree(db, clean);
  const res = await db.query("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM categories;");
  const next = num(rowsOf(res)[0]?.n);
  const now = new Date().toISOString();
  await runSerializedWrite(() =>
    db.executeTransaction(
      [
        {
          statement:
            "INSERT INTO categories (id, name, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?);",
          values: [uid("cat"), clean, next, now, now],
        },
      ],
      false,
    ),
  );
}

export async function createProduct(input: {
  name: string;
  categoryId: string;
  basePriceRp: Rupiah;
}): Promise<void> {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error("Nama menu wajib diisi.");
  if (!Number.isInteger(input.basePriceRp) || input.basePriceRp < 0) {
    throw new Error("Harga harus bilangan bulat Rupiah.");
  }
  if (!native) {
    createProductLocal({ ...input, name });
    return;
  }
  const db = await getDb();
  const now = new Date().toISOString();
  await runSerializedWrite(() =>
    db.executeTransaction(
      [
        {
          statement:
            "INSERT INTO products (id, category_id, name, description, base_price_rp, is_active, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 1, ?, ?);",
          values: [uid("prod"), input.categoryId, name, input.basePriceRp, now, now],
        },
      ],
      false,
    ),
  );
}

export async function updateProduct(
  id: string,
  patch: { name?: string; basePriceRp?: Rupiah; categoryId?: string },
): Promise<void> {
  if (!native) {
    updateProductLocal(id, patch);
    return;
  }
  const db = await getDb();
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 80);
    if (!name) throw new Error("Nama menu wajib diisi.");
    sets.push("name = ?");
    values.push(name);
  }
  if (patch.basePriceRp !== undefined) {
    if (!Number.isInteger(patch.basePriceRp) || patch.basePriceRp < 0) {
      throw new Error("Harga harus bilangan bulat Rupiah.");
    }
    sets.push("base_price_rp = ?");
    values.push(patch.basePriceRp);
  }
  if (patch.categoryId !== undefined) {
    sets.push("category_id = ?");
    values.push(patch.categoryId);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  values.push(new Date().toISOString(), id);
  await runSerializedWrite(() =>
    db.executeTransaction(
      [{ statement: `UPDATE products SET ${sets.join(", ")} WHERE id = ?;`, values }],
      false,
    ),
  );
}

export async function deactivateProduct(id: string): Promise<void> {
  if (!native) {
    deactivateProductLocal(id);
    return;
  }
  const db = await getDb();
  const now = new Date().toISOString();
  await runSerializedWrite(() =>
    db.executeTransaction(
      [
        { statement: "UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?;", values: [now, id] },
      ],
      false,
    ),
  );
}

export async function createVariant(productId: string, name: string, priceDeltaRp: Rupiah): Promise<void> {
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error("Nama varian wajib diisi.");
  if (!native) {
    createVariantLocal(productId, clean, priceDeltaRp);
    return;
  }
  const db = await getDb();
  await runSerializedWrite(() =>
    db.executeTransaction(
      [
        {
          statement:
            "INSERT INTO product_variants (id, product_id, name, price_delta_rp, is_active) VALUES (?, ?, ?, ?, 1);",
          values: [uid("var"), productId, clean, Math.trunc(priceDeltaRp)],
        },
      ],
      false,
    ),
  );
}

export async function updateVariant(id: string, patch: { name?: string; priceDeltaRp?: Rupiah }): Promise<void> {
  if (!native) {
    updateVariantLocal(id, patch);
    return;
  }
  const db = await getDb();
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 40);
    if (!name) throw new Error("Nama varian wajib diisi.");
    sets.push("name = ?");
    values.push(name);
  }
  if (patch.priceDeltaRp !== undefined) {
    sets.push("price_delta_rp = ?");
    values.push(Math.trunc(patch.priceDeltaRp));
  }
  if (sets.length === 0) return;
  values.push(id);
  await runSerializedWrite(() =>
    db.executeTransaction(
      [{ statement: `UPDATE product_variants SET ${sets.join(", ")} WHERE id = ?;`, values }],
      false,
    ),
  );
}

export async function deactivateVariant(id: string): Promise<void> {
  if (!native) {
    deactivateVariantLocal(id);
    return;
  }
  const db = await getDb();
  await runSerializedWrite(() =>
    db.executeTransaction(
      [{ statement: "UPDATE product_variants SET is_active = 0 WHERE id = ?;", values: [id] }],
      false,
    ),
  );
}
