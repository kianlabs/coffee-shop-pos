import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { getDb } from "./db";
import { runSerializedWrite } from "./tx";
import {
  calcHppForLine,
  snapshotForOrder,
} from "../domain/hpp";

/**
 * Stok + pembelian (tabel UPGRADE_V2).
 *
 * Costing DIKUNCI: LAST-COST — `getLastCosts()` mengambil cost dengan
 * `effective_at` terbesar per ingredient. Ganti ke average/FIFO kelak dengan
 * tambah kolom/tabel lot + ganti resolver di `src/domain/hpp.ts` saja.
 *
 * Penarikan stok DIJALANKAN DI DALAM transaksi checkout: `prepareConsumption()`
 * mengembalikan statement yang digabung ke transaksi order, sehingga order dan
 * pemotongan stok tersimpan bersama atau tidak sama sekali. Tanpa resep aktif
 * item dilewati (kasir tetap sukses).
 */
export const STOCK_DEDUCTION_ENABLED = true;

/** Stok disimpan 3 desimal supaya penjumlahan float tidak menumpuk drift. */
export function roundQty(qty: number): number {
  return Math.round(qty * 1000) / 1000;
}

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

export type Statement = { statement: string; values?: unknown[] };

export type ConsumptionLineResult = {
  hppUnitRp: number;
  hppTotalRp: number;
  recipeVersion: number | null;
  detailJson: string | null;
};

export type ConsumptionPlan = {
  statements: Statement[];
  /** Kunci: orderItemId. */
  byItem: Map<string, ConsumptionLineResult>;
  /** Ingredient yang stoknya akan minus setelah transaksi ini. */
  negative: Array<{ ingredientId: string; name: string; after: number }>;
};

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

export type IngredientRow = { id: string; name: string; baseUnit: string; stockQty: number };

/** Daftar bahan + stok terkini, untuk layar Stok. */
export async function loadIngredients(db?: SQLiteDBConnection): Promise<IngredientRow[]> {
  const conn = db ?? (await getDb());
  const res = await conn.query(
    "SELECT id, name, base_unit, stock_qty FROM ingredients ORDER BY name ASC;",
  );
  return rowsOf(res).map((r) => ({
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    baseUnit: String(r.base_unit ?? ""),
    stockQty: Number(r.stock_qty ?? 0),
  }));
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
  await runSerializedWrite(() =>
    conn.executeTransaction(
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
          statement: "UPDATE ingredients SET stock_qty = ROUND(stock_qty + ?, 3) WHERE id = ?;",
          values: [qty, ingredientId],
        },
        {
          statement:
            "INSERT INTO stock_movements (id, ingredient_id, product_id, qty, movement_type, reference_type, reference_id, reason, actor, created_at) VALUES (?, ?, NULL, ?, 'purchase_received', 'purchase', ?, NULL, ?, ?);",
          values: [moveId, ingredientId, roundQty(qty), costId, actor, now],
        },
      ],
      false,
    ),
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
  await runSerializedWrite(() =>
    conn.executeTransaction(
      [
        {
          statement: "UPDATE ingredients SET stock_qty = ROUND(stock_qty + ?, 3) WHERE id = ?;",
          values: [deltaQty, ingredientId],
        },
        {
          statement:
            "INSERT INTO stock_movements (id, ingredient_id, product_id, qty, movement_type, reference_type, reference_id, reason, actor, created_at) VALUES (?, ?, NULL, ?, ?, 'adjustment', ?, ?, ?, ?);",
          values: [moveId, ingredientId, roundQty(deltaQty), type, moveId, reason, actor, now],
        },
      ],
      false,
    ),
  );
  return getStock(conn, ingredientId);
}

/**
 * Bangun statement konsumsi stok + snapshot HPP untuk satu order, TANPA
 * mengeksekusi. Pemanggil (checkout) menggabungkannya ke transaksi order,
 * sehingga order + stok + HPP tersimpan atomik.
 */
export async function prepareConsumption(
  db: SQLiteDBConnection,
  orderId: string,
  lines: OrderConsumptionLine[],
  now: string,
  actor: string | null = null,
): Promise<ConsumptionPlan> {
  if (!orderId) throw new Error("orderId wajib diisi.");
  const statements: Statement[] = [];
  const byItem = new Map<string, ConsumptionLineResult>();
  const negative: ConsumptionPlan["negative"] = [];

  type Planned = {
    line: OrderConsumptionLine;
    rows: ReturnType<typeof snapshotForOrder>["rows"];
    hppTotalRp: number;
    perUnitRp: number;
    version: number;
    detailJson: string;
  };
  const planned: Planned[] = [];
  const need = new Map<string, number>();
  const names = new Map<string, string>();

  for (const line of lines) {
    if (!line.orderItemId || !(line.qty > 0)) continue;
    const recipe = await findActiveRecipe(db, line.productId, line.variantId);
    if (!recipe) continue;
    const items = await loadRecipeItems(db, recipe.id);
    if (items.length === 0) continue;
    const costs = await getLastCosts(db, items.map((i) => i.ingredient_id));
    const hpp = calcHppForLine(
      items.map((i) => ({
        ingredientId: i.ingredient_id,
        ingredientName: i.name,
        qtyPerUnit: i.qty_per_unit,
        costPerUnitRp: costs.get(i.ingredient_id) ?? 0,
      })),
    );
    const snap = snapshotForOrder(line.orderItemId, line.qty, hpp);
    planned.push({
      line,
      rows: snap.rows,
      hppTotalRp: snap.hppTotalRp,
      perUnitRp: hpp.perUnitRp,
      version: recipe.version,
      detailJson: JSON.stringify({ version: recipe.version, lines: hpp.lines }),
    });
    for (const row of snap.rows) {
      need.set(row.ingredientId, roundQty((need.get(row.ingredientId) ?? 0) + row.qty));
      names.set(row.ingredientId, row.ingredientName);
    }
  }

  const stock = new Map<string, number>();
  for (const id of need.keys()) {
    stock.set(id, await getStock(db, id));
  }
  for (const [id, qty] of need) {
    const after = roundQty((stock.get(id) ?? 0) - qty);
    if (after < 0) {
      negative.push({ ingredientId: id, name: names.get(id) ?? id, after });
    }
  }

  // Retry safety: kalau movement untuk order ini sudah ada, stok sudah pernah
  // dipotong — jangan ulangi. (`INSERT OR IGNORE` saja tidak cukup: UPDATE
  // berikutnya tetap akan mengurangi stok.)
  const already = new Set<string>();
  try {
    const res = await db.query(
      "SELECT ingredient_id AS id FROM stock_movements WHERE reference_type = 'order' AND reference_id = ? AND movement_type = 'sale_consumption';",
      [orderId],
    );
    for (const r of rowsOf(res)) already.add(String(r.id ?? ""));
  } catch {
    // Tabel stock_movements belum ada — tidak ada yang perlu dicek.
  }

  for (const p of planned) {
    for (const row of p.rows) {
      statements.push({
        statement:
          "INSERT OR IGNORE INTO order_item_cost_snapshots (id, order_item_id, ingredient_id, ingredient_name, qty, cost_per_unit_rp, line_cost_rp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
        values: [
          `snap-${row.orderItemId}-${row.ingredientId}`,
          row.orderItemId,
          row.ingredientId,
          row.ingredientName,
          row.qty,
          row.costPerUnitRp,
          row.lineCostRp,
          now,
        ],
      });
    }
    byItem.set(p.line.orderItemId, {
      hppUnitRp: p.perUnitRp,
      hppTotalRp: p.hppTotalRp,
      recipeVersion: p.version,
      detailJson: p.detailJson,
    });
  }

  // Satu movement + satu UPDATE per ingredient (bukan per baris order):
  // id movement deterministik supaya retry tidak pernah memotong stok dua kali.
  for (const [ingredientId, qty] of need) {
    if (already.has(ingredientId)) continue;
    const movementId = `mv-sale-${orderId}-${ingredientId}`;
    statements.push({
      statement:
        "INSERT OR IGNORE INTO stock_movements (id, ingredient_id, product_id, qty, movement_type, reference_type, reference_id, reason, actor, created_at) VALUES (?, ?, NULL, ?, 'sale_consumption', 'order', ?, NULL, ?, ?);",
      values: [movementId, ingredientId, -qty, orderId, actor, now],
    });
    // UPDATE hanya jalan kalau movement tadi benar-benar masuk. Tanpa syarat
    // ini, retry akan menulis movement yang di-ignore tapi tetap memotong stok.
    statements.push({
      statement:
        "UPDATE ingredients SET stock_qty = ROUND(stock_qty - ?, 3) WHERE id = ? AND EXISTS (SELECT 1 FROM stock_movements WHERE id = ?);",
      values: [qty, ingredientId, movementId],
    });
  }

  return { statements, byItem, negative };
}

/**
 * Konsumsi stok untuk order yang sudah tersimpan (jalur manual/kompatibilitas).
 * Checkout normal memakai `prepareConsumption()` agar ikut transaksi order.
 */
export async function consumeForOrder(
  orderId: string,
  lines: OrderConsumptionLine[],
  actor?: string | null,
  db?: SQLiteDBConnection,
): Promise<{ consumedItems: number; hppTotalRp: number }> {
  const conn = db ?? (await getDb());
  const now = new Date().toISOString();
  const plan = await prepareConsumption(conn, orderId, lines, now, actor ?? null);
  if (plan.statements.length === 0) {
    return { consumedItems: 0, hppTotalRp: 0 };
  }
  await runSerializedWrite(() => conn.executeTransaction(plan.statements, false));
  let total = 0;
  for (const v of plan.byItem.values()) total += v.hppTotalRp;
  return { consumedItems: plan.byItem.size, hppTotalRp: total };
}

export type VoidReversalPlan = { statements: Statement[]; restoredLines: number };

/**
 * Kebalikan dari konsumsi: tulis movement `return_in` dan kembalikan stok.
 * Idempoten — kalau reversal untuk order ini sudah pernah ditulis (baik void maupun refund),
 * hasilnya kosong (dijaga juga oleh unique index V5).
 */
export async function prepareVoidReversal(
  db: SQLiteDBConnection,
  orderId: string,
  now: string,
  actor: string | null = null,
): Promise<VoidReversalPlan> {
  if (!orderId) throw new Error("orderId wajib diisi.");
  const already = await db.query(
    "SELECT COUNT(*) AS c FROM stock_movements WHERE reference_type IN ('order_void', 'order_refund') AND reference_id = ?;",
    [orderId],
  );
  const alreadyRow = rowsOf(already)[0];
  if (Number(alreadyRow?.c ?? 0) > 0) {
    return { statements: [], restoredLines: 0 };
  }

  const res = await db.query(
    "SELECT ingredient_id AS ingredient_id, qty AS qty FROM stock_movements WHERE reference_type = 'order' AND reference_id = ? AND movement_type = 'sale_consumption';",
    [orderId],
  );
  const statements: Statement[] = [];
  let restoredLines = 0;
  for (const row of rowsOf(res)) {
    const ingredientId = String(row.ingredient_id ?? "");
    const consumed = Number(row.qty);
    if (!ingredientId || !Number.isFinite(consumed) || consumed === 0) continue;
    const back = roundQty(-consumed);
    const movementId = `mv-void-${orderId}-${ingredientId}`;
    statements.push({
      statement:
        "INSERT OR IGNORE INTO stock_movements (id, ingredient_id, product_id, qty, movement_type, reference_type, reference_id, reason, actor, created_at) VALUES (?, ?, NULL, ?, 'return_in', 'order_void', ?, 'void order', ?, ?);",
      values: [movementId, ingredientId, back, orderId, actor, now],
    });
    statements.push({
      statement:
        "UPDATE ingredients SET stock_qty = ROUND(stock_qty + ?, 3) WHERE id = ? AND EXISTS (SELECT 1 FROM stock_movements WHERE id = ?);",
      values: [back, ingredientId, movementId],
    });
    restoredLines += 1;
  }
  return { statements, restoredLines };
}

/**
 * Kebalikan dari konsumsi untuk refund: tulis movement `return_in` dan kembalikan stok.
 *
 * Keputusan skema ID & reference movement:
 * Reversal refund menggunakan prefix ID `mv-refund-${orderId}-${ingredientId}` dan
 * `reference_type = 'order_refund'` (bukan menduplikasi `order_void`) agar riwayat mutasi
 * stok di ledger membedakan dengan jelas antara pembatalan void vs pengembalian refund.
 * Pencegahan double-return stok dijamin di dua lapis:
 * 1. Di level status order: transisi status menggunakan klausa atomik `WHERE id = ? AND status = 'completed'`.
 * 2. Di level stok: query penjaga `WHERE reference_type IN ('order_void', 'order_refund') AND reference_id = ?`
 *    memastikan tidak ada reversal ganda sekalipun order pernah diproses sebelumnya.
 */
export async function prepareRefundReversal(
  db: SQLiteDBConnection,
  orderId: string,
  now: string,
  actor: string | null = null,
): Promise<VoidReversalPlan> {
  if (!orderId) throw new Error("orderId wajib diisi.");
  const already = await db.query(
    "SELECT COUNT(*) AS c FROM stock_movements WHERE reference_type IN ('order_void', 'order_refund') AND reference_id = ?;",
    [orderId],
  );
  const alreadyRow = rowsOf(already)[0];
  if (Number(alreadyRow?.c ?? 0) > 0) {
    return { statements: [], restoredLines: 0 };
  }

  const res = await db.query(
    "SELECT ingredient_id AS ingredient_id, qty AS qty FROM stock_movements WHERE reference_type = 'order' AND reference_id = ? AND movement_type = 'sale_consumption';",
    [orderId],
  );
  const statements: Statement[] = [];
  let restoredLines = 0;
  for (const row of rowsOf(res)) {
    const ingredientId = String(row.ingredient_id ?? "");
    const consumed = Number(row.qty);
    if (!ingredientId || !Number.isFinite(consumed) || consumed === 0) continue;
    const back = roundQty(-consumed);
    const movementId = `mv-refund-${orderId}-${ingredientId}`;
    statements.push({
      statement:
        "INSERT OR IGNORE INTO stock_movements (id, ingredient_id, product_id, qty, movement_type, reference_type, reference_id, reason, actor, created_at) VALUES (?, ?, NULL, ?, 'return_in', 'order_refund', ?, 'refund order', ?, ?);",
      values: [movementId, ingredientId, back, orderId, actor, now],
    });
    statements.push({
      statement:
        "UPDATE ingredients SET stock_qty = ROUND(stock_qty + ?, 3) WHERE id = ? AND EXISTS (SELECT 1 FROM stock_movements WHERE id = ?);",
      values: [back, ingredientId, movementId],
    });
    restoredLines += 1;
  }
  return { statements, restoredLines };
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
