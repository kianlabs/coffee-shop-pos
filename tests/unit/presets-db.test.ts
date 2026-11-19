import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8 } from "@/data/migrations";
import { applyPreset, type PresetPlan } from "@/domain/presets";
import { openSqlJsDb } from "@/testing/sqlJsDb";

type Db = Awaited<ReturnType<typeof openSqlJsDb>>;
let db: Db;
const NOW = "2026-11-19T10:00:00.000Z";
/** Tables a preset may write (labels are stored as one app_settings row here). */
const PRESET_TABLES = new Set(["modules", "app_settings"]);

const SEED: [string, (string | number)[]][] = [
  ["INSERT INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)", ["c1", "Kopi", NOW, NOW]],
  ["INSERT INTO products (id, category_id, name, base_price_rp, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", ["p1", "c1", "Latte", 25000, NOW, NOW]],
  ["INSERT INTO product_variants (id, product_id, name) VALUES (?, ?, ?)", ["v1", "p1", "Large"]],
  ["INSERT INTO orders (id, receipt_number, idempotency_key, status, subtotal_rp, total_rp, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ["o1", "R-1", "k1", "completed", 25000, 25000, NOW, NOW]],
  ["INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, quantity, unit_price_rp, line_total_rp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ["i1", "o1", "p1", "Latte", 1, 25000, 25000, NOW]],
  ["INSERT INTO payments (id, order_id, method, amount_rp, status, created_at) VALUES (?, ?, ?, ?, ?, ?)", ["pay1", "o1", "cash", 25000, "paid", NOW]],
  ["INSERT INTO ingredients (id, name, base_unit, stock_qty, created_at) VALUES (?, ?, ?, ?, ?)", ["g1", "Susu", "ml", 1000, NOW]],
  ["INSERT INTO recipes (id, product_id, created_at) VALUES (?, ?, ?)", ["r1", "p1", NOW]],
  ["INSERT INTO recipe_items (id, recipe_id, ingredient_id, qty_per_unit) VALUES (?, ?, ?, ?)", ["ri1", "r1", "g1", 150]],
  ["INSERT INTO stock_movements (id, ingredient_id, qty, movement_type, created_at) VALUES (?, ?, ?, ?, ?)", ["m1", "g1", 1000, "purchase_received", NOW]],
];

/** Test writer: persists a plan the way ModuleRepo is expected to. */
async function persist(plan: PresetPlan): Promise<void> {
  const upsertSetting = "INSERT OR REPLACE INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)";
  for (const m of plan.modules) {
    await db.run("INSERT OR REPLACE INTO modules (id, enabled, enabled_at, updated_by) VALUES (?, ?, ?, ?)", [m.id, m.enabled ? 1 : 0, NOW, "owner-1"]);
  }
  for (const s of plan.settings) await db.run(upsertSetting, [s.key, JSON.stringify(s.value), NOW, "owner-1"]);
  await db.run(upsertSetting, ["ui_label_overrides", JSON.stringify(plan.labels), NOW, "owner-1"]);
}

async function rowCounts(): Promise<Record<string, number>> {
  const tables = await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    if (PRESET_TABLES.has(name)) continue;
    const [row] = await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"', '""')}"`);
    counts[name] = row?.n ?? -1;
  }
  return counts;
}

beforeEach(async () => {
  db = await openSqlJsDb();
  for (const batch of [UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8]) {
    for (const s of batch) await db.exec(s);
  }
  for (const [sql, params] of SEED) await db.run(sql, params);
});
afterEach(() => db.close());

describe("applyPreset di SQLite (Req 29.2)", () => {
  it("jumlah baris tabel transaksi, katalog, dan stok tidak berubah", async () => {
    const before = await rowCounts();
    for (const table of ["orders", "order_items", "payments", "products", "categories", "product_variants", "ingredients", "recipes", "recipe_items", "stock_movements"]) {
      expect(before[table], table).toBeGreaterThan(0);
    }
    for (const type of ["fnb_resto", "lainnya", "fnb_warung", "fnb_kafe"]) {
      const result = applyPreset(type, ["fnb", "pelanggan"]);
      if (!result.ok) throw new Error(result.error);
      await persist(result.plan);
      expect(await rowCounts(), type).toEqual(before);
    }
    const mods = await db.query<{ id: string; enabled: number }>("SELECT id, enabled FROM modules ORDER BY id");
    expect(mods).toEqual([{ id: "fnb", enabled: 1 }, { id: "pelanggan", enabled: 0 }]);
  });
});
