import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { getDb } from "./db";
import {
  calcHppForLine,
  snapshotForOrder,
  type RecipeLineInput,
} from "../domain/hpp";

/**
 * Stok + pembelian (tabel UPGRADE_V2).
 *
 * Costing DIKUNCI: LAST-COST — `getLastCosts()` mengambil cost dengan
 * `effective_at` terbesar per ingredient. Ganti ke average/FIFO kelak dengan
 * tambah kolom/tabel lot + ganti resolver di `src/domain/hpp.ts` saja.
 *
 * Penarikan stok OTOMATIS AKTIF (best-effort): `checkoutAtomicAsync` memanggil
 * `consumeForOrder()` setelah order tersimpan. Tanpa resep aktif item dilewati
 * (kasir tetap sukses); tabel V2 belum ada → dilewati; error stok tidak
 * pernah menggagalkan checkout yang sudah tersimpan.
 */
export const STOCK_DEDUCTION_ENABLED = true;

export const MOVEMENT_TYPES = [
  "purchase_received",
  "sale_consumption",
  "waste",
  "adjustment_in",
  "adjustment_out",
  "return_in",
  "return_out",
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

export type OrderConsumptionLine = {
  orderItemId: string;
  productId: string;
  variantId: string | null;
  qty: number;
};

type RecipeRow = { id: string; version: number };
type RecipeItemRow = {
  ingredient_id: string;
  name: string;
  qty_per_unit: number;
};

function uid(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

// SAFETY: hasil query cap-sqlite berupa objek baris polos; penyempitan unknown[] ke record aman untuk akses kolom bernama.
function rowsOf(res: { values?: unknown[] }): Record<string, unknown>[] {
  return Array.isArray(res.values) ? (res.values as Record<string, unknown>[]) : [];
}
/** Ambil last-cost per ingredient: cost dengan effective_at terbesar. */
export async function getLastCosts(
  db: SQLiteDBConnection,
  ingredientIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ingredientIds.length === 0) return out;
  const wanted = new Set(ingredientIds);
  // Query statis penuh lalu filter di JS — tanpa IN dinamis agar lolos lint SQL.
  const res = await db.query(
    "SELECT h.ingredient_id AS ingredient_id, h.cost_per_unit_rp AS cost_per_unit_rp, h.effective_at AS effective_at FROM ingredient_cost_history h;",
  );
  const latest = new Map<string, { at: string; cost: number }>();
  for (const r of rowsOf(res)) {
    const id = String(r.ingredient_id ?? "");
    if (!wanted.has(id)) continue;
    const at = String(r.effective_at ?? "");
    const cost = Number(r.cost_per_unit_rp);
    if (!Number.isFinite(cost)) continue;
    const prev = latest.get(id);
    if (!prev || at > prev.at) latest.set(id, { at, cost });
  }
  for (const [k, v] of latest) out.set(k, v.cost);
  return out;
}

/** Stok saat ini untuk satu ingredient (0 bila belum ada). */
export async function getStock(db: SQLiteDBConnection, ingredientId: string): Promise<number> {
  const res = await db.query("SELECT stock_qty AS q FROM ingredients WHERE id = ?;", [ingredientId]);
  const row = rowsOf(res)[0];
  return typeof row?.q === "number" ? row.q : 0;
}

/**
 * Catat pembelian: tambah/upsert ingredient + cost history + naikkan stok +
 * movement `purchase_received`. Membuat ingredient bila belum ada
 * (butuh `name`; `baseUnit` DEFAULT 'pcs' bila tidak diisi).
 */
export type RecordPurchaseArgs = {
  ingredientId: string;
  name: string;
  baseUnit?: string;
  qty: number;
  costPerUnitRp: number;
  actor?: string | null;
  purchasedAt?: string;
};
export async function recordPurchase(
  args: RecordPurchaseArgs,
  db?: SQLiteDBConnection,
): Promise<void> {
  const conn = db ?? (await getDb());
  const {
    ingredientId,
    name,
    baseUnit = "pcs",
    qty,
    costPerUnitRp,
    actor = null,
    purchasedAt,
  } = args;
  if (!ingredientId) throw new Error("ingredientId wajib diisi.");
  if (!name) throw new Error("Nama bahan wajib diisi.");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Jumlah pembelian harus lebih dari 0.");
  if (!Number.isFinite(costPerUnitRp) || costPerUnitRp < 0) {
    throw new Error("Harga beli per satuan tidak boleh negatif.");
  }
  const now = purchasedAt ?? new Date().toISOString();
  const costId = uid("cost");
  const moveId = uid("mov");
  await conn.executeTransaction(
    [
      {
        statement:
          "INSERT INTO ingredients (id, name, base_unit, stock_qty, created_at) VALUES (?, ?, ?, 0, ?) ON CONFLICT(id) DO NOTHING;",
        values: [ingredientId, name, baseUnit, now],
      },
      {
        statement:
          "INSERT INTO ingredient_cost_history (id, ingredient_id, cost_per_unit_rp, effective_at, created_at) VALUES (?, ?, ?, ?, ?);",
        values: [costId, ingredientId, Math.trunc(costPerUnitRp), now, now],
      },
      {
        statement: "UPDATE ingredients SET stock_qty = stock_qty + ? WHERE id = ?;",
        values: [qty, ingredientId],
      },
      {
        statement:
          "INSERT INTO stock_movements (id, ingredient_id, product_id, qty, movement_type, reference_type, reference_id, reason, actor, created_at) VALUES (?, ?, NULL, ?, 'purchase_received', 'purchase', ?, NULL, ?, ?);",
        values: [moveId, ingredientId, qty, costId, actor, now],
      },
    ],
    false,
  );
}

/**
 * Koreksi manual: geser stok sebesar `deltaQty` (+/-) + movement
 * adjustment_in/out. `reason` wajib (pesan Indonesia bila kosong).
 */
export type AdjustStockArgs = {
  ingredientId: string;
  deltaQty: number;
  reason: string;
  actor?: string | null;
};
export async function adjustStock(
  args: AdjustStockArgs,
  db?: SQLiteDBConnection,
): Promise<number> {
  const conn = db ?? (await getDb());
  const { ingredientId, deltaQty, reason, actor = null } = args;
  if (!ingredientId) throw new Error("ingredientId wajib diisi.");
  if (!reason || !reason.trim()) throw new Error("Alasan penyesuaian wajib diisi.");
  if (!Number.isFinite(deltaQty) || deltaQty === 0) {
    throw new Error("Selisih penyesuaian tidak boleh nol.");
  }
  const now = new Date().toISOString();
  const moveId = uid("mov");
  const type: MovementType = deltaQty > 0 ? "adjustment_in" : "adjustment_out";
  await conn.executeTransaction(
    [
      {
        statement: "UPDATE ingredients SET stock_qty = stock_qty + ? WHERE id = ?;",
        values: [deltaQty, ingredientId],
      },
      {
        statement:
          "INSERT INTO stock_movements (id, ingredient_id, product_id, qty, movement_type, reference_type, reference_id, reason, actor, created_at) VALUES (?, ?, NULL, ?, ?, 'adjustment', ?, ?, ?, ?);",
        values: [moveId, ingredientId, deltaQty, type, moveId, reason, actor, now],
      },
    ],
    false,
  );
  return getStock(conn, ingredientId);
}

/**
 * Konsumsi untuk satu order (dipanggil MANUAL — lihat STOCK_DEDUCTION_ENABLED).
 * Untuk tiap order item: cari resep aktif (variant spesifik dulu, lalu
 * generik product), hitung HPP last-cost, insert snapshot +
 * movement `sale_consumption` negatif + kurangi stok. Tanpa resep aktif:
 * item dilewati (tidak error) agar kasir tetap jalan saat resep belum lengkap.
 */
export async function consumeForOrder(
  orderId: string,
  lines: OrderConsumptionLine[],
  actor?: string | null,
  db?: SQLiteDBConnection,
): Promise<{ consumedItems: number; hppTotalRp: number }> {
  const conn = db ?? (await getDb());
  if (!orderId) throw new Error("orderId wajib diisi.");
  const now = new Date().toISOString();
  let consumedItems = 0;
  let hppTotalRp = 0;

  for (const line of lines) {
    if (!line.orderItemId || line.qty <= 0) continue;
    const recipe = await findActiveRecipe(conn, line.productId, line.variantId);
    if (!recipe) continue;
    const items = await loadRecipeItems(conn, recipe.id);
    if (items.length === 0) continue;
    const costs = await getLastCosts(
      conn,
      items.map((i) => i.ingredient_id),
    );
    const recipeInput: RecipeLineInput[] = items.map((i) => ({
      ingredientId: i.ingredient_id,
      ingredientName: i.name,
      qtyPerUnit: i.qty_per_unit,
      // DEFAULT: ingredient tanpa histori cost dianggap 0 (tetap snapshot agar ketahuan).
      costPerUnitRp: costs.get(i.ingredient_id) ?? 0,
    }));
    const hpp = calcHppForLine(recipeInput);
    const snap = snapshotForOrder(line.orderItemId, line.qty, hpp);
    const txn: { statement: string; values?: unknown[] }[] = [];
    for (const row of snap.rows) {
      txn.push({
        statement:
          "INSERT INTO order_item_cost_snapshots (id, order_item_id, ingredient_id, ingredient_name, qty, cost_per_unit_rp, line_cost_rp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
        values: [
          uid("snap"),
          row.orderItemId,
          row.ingredientId,
          row.ingredientName,
          row.qty,
          row.costPerUnitRp,
          row.lineCostRp,
          now,
        ],
      });
      txn.push({
        statement:
          "INSERT INTO stock_movements (id, ingredient_id, product_id, qty, movement_type, reference_type, reference_id, reason, actor, created_at) VALUES (?, ?, ?, ?, 'sale_consumption', 'order', ?, NULL, ?, ?);",
        values: [uid("mov"), row.ingredientId, line.productId || null, -row.qty, orderId, actor ?? null, now],
      });
      txn.push({
        statement: "UPDATE ingredients SET stock_qty = stock_qty - ? WHERE id = ?;",
        values: [row.qty, row.ingredientId],
      });
    }
    txn.push({
      statement:
        "UPDATE order_items SET hpp_total_rp = ?, hpp_unit_rp = ?, hpp_source = 'recipe', recipe_version_snapshot = ? WHERE id = ? AND hpp_source <> 'manual';",
      values: [snap.hppTotalRp, hpp.perUnitRp, recipe.version, line.orderItemId],
    });
    await conn.executeTransaction(txn, false);
    consumedItems += 1;
    hppTotalRp += snap.hppTotalRp;
  }
  return { consumedItems, hppTotalRp };
}

async function findActiveRecipe(
  db: SQLiteDBConnection,
  productId: string,
  variantId: string | null,
): Promise<RecipeRow | null> {
  if (variantId) {
    const res = await db.query(
      "SELECT id, version FROM recipes WHERE product_id = ? AND variant_id = ? AND is_active = 1 LIMIT 1;",
      [productId, variantId],
    );
    // SAFETY: kolom SELECT (id, version) cocok 1:1 dengan RecipeRow; baris cap-sqlite selalu objek polos.
    const row = rowsOf(res)[0] as unknown as RecipeRow | undefined;
    if (row) return row;
  }
  const res = await db.query(
    "SELECT id, version FROM recipes WHERE product_id = ? AND variant_id IS NULL AND is_active = 1 LIMIT 1;",
    [productId],
  );
  // SAFETY: kolom SELECT (id, version) cocok 1:1 dengan RecipeRow; baris cap-sqlite selalu objek polos.
  return (rowsOf(res)[0] as unknown as RecipeRow | undefined) ?? null;
}

async function loadRecipeItems(db: SQLiteDBConnection, recipeId: string): Promise<RecipeItemRow[]> {
  const res = await db.query(
    `SELECT ri.ingredient_id AS ingredient_id, i.name AS name, ri.qty_per_unit AS qty_per_unit
     FROM recipe_items ri JOIN ingredients i ON i.id = ri.ingredient_id
     WHERE ri.recipe_id = ?;`,
    [recipeId],
  );
  return rowsOf(res).map((r) => ({
    ingredient_id: String(r.ingredient_id),
    name: String(r.name ?? ""),
    qty_per_unit: Number(r.qty_per_unit),
  }));
}

/** Daftar tabel V2 — dipakai dev-tools/pemeriksaan skema. */
export function v2TableNames(): string[] {
  return [
    "ingredients",
    "ingredient_cost_history",
    "recipes",
    "recipe_items",
    "order_item_cost_snapshots",
    "stock_movements",
  ];
}

/** Himpunan nama tabel V2 untuk allowlist — cegah interpolasi nama tabel bebas. */
const V2_TABLE_SET: ReadonlySet<string> = new Set(v2TableNames());

/** True bila semua tabel V2 ada di `sqlite_master` (query statis, tanpa IN dinamis). */
export async function v2TablesExist(db: SQLiteDBConnection): Promise<boolean> {
  const res = await db.query(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND (name = 'ingredients' OR name = 'ingredient_cost_history' OR name = 'recipes' OR name = 'recipe_items' OR name = 'order_item_cost_snapshots' OR name = 'stock_movements');",
  );
  const row = (Array.isArray(res.values) ? res.values[0] : undefined) as { c?: number } | undefined;
  return (typeof row?.c === "number" ? row.c : 0) >= v2TableNames().length;
}

/** True bila nama tabel lolos allowlist V2 (dipakai bila query dinamis perlu nama tabel). */
export function isV2TableName(name: string): boolean {
  return V2_TABLE_SET.has(name);
}
