import { Capacitor } from "@capacitor/core";
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { DB_NAME, DB_VERSION, UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4 } from "./migrations";
import { CATEGORIES, PRODUCTS, VARIANTS } from "../domain/catalog";

let sqlite: SQLiteConnection | null = null;
let conn: SQLiteDBConnection | null = null;
let ready: Promise<SQLiteDBConnection> | null = null;

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

function getSQLite(): SQLiteConnection {
  if (!sqlite) {
    sqlite = new SQLiteConnection(CapacitorSQLite);
  }
  return sqlite;
}

async function openConnection(): Promise<SQLiteDBConnection> {
  const sql = getSQLite();
  if (isNativePlatform()) {
    const consistency = await sql.checkConnectionsConsistency().catch(() => null);
    if (!consistency?.result) {
      await sql.closeAllConnections().catch(() => undefined);
    }
  } else {
    await sql.initWebStore();
  }
  await CapacitorSQLite.addUpgradeStatement({
    database: DB_NAME,
    upgrade: [
      { toVersion: 1, statements: UPGRADE_V1 },
      { toVersion: 2, statements: UPGRADE_V2 },
      { toVersion: 3, statements: UPGRADE_V3 },
      { toVersion: 4, statements: UPGRADE_V4 },
    ],
  }).catch(() => undefined);
  const exists = await sql.isConnection(DB_NAME, false).catch(() => ({ result: false }));
  const opened = exists.result
    ? await sql.retrieveConnection(DB_NAME, false)
    : await sql.createConnection(DB_NAME, false, "no-encryption", DB_VERSION, false);
  conn = opened;
  await opened.open();
  await ensureV3Columns(opened);
  await ensureV4Columns(opened);
  await seedCatalog(opened);
  return opened;
}

type TableCol = { name?: unknown };

async function tableHasColumn(
  db: SQLiteDBConnection,
  table: string,
  column: string,
): Promise<boolean> {
  try {
    const res = await db.query(`PRAGMA table_info(${table});`);
    const rows = (Array.isArray(res.values) ? res.values : []) as TableCol[];
    return rows.some((r) => r.name === column);
  } catch {
    return false;
  }
}

async function ensureV3Columns(db: SQLiteDBConnection): Promise<void> {
  if (!(await tableHasColumn(db, "orders", "rounding_rp"))) {
    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN rounding_rp INTEGER NOT NULL DEFAULT 0;`);
    } catch {
      // Kolom sudah ada lewat upgrade path lain atau SQLite menolak duplikat.
    }
  }
  try {
    await db.execute(
      `CREATE TABLE IF NOT EXISTS payments_v3 (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    method TEXT NOT NULL CHECK (method IN ('cash','qris_manual','other')),
    amount_rp INTEGER NOT NULL CHECK (amount_rp >= 0),
    status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','refunded','voided')),
    reference_note TEXT,
    paid_at TEXT,
    created_at TEXT NOT NULL
  );`,
    );
    const hasVoided = await (async () => {
      try {
        const res = await db.query(`SELECT sql AS s FROM sqlite_master WHERE type='table' AND name='payments';`);
        const row = (res.values?.[0] ?? {}) as { s?: unknown };
        return typeof row.s === "string" && row.s.includes("'voided'");
      } catch {
        return true;
      }
    })();
    if (!hasVoided) {
      await db.execute(
        `INSERT OR IGNORE INTO payments_v3 (id, order_id, method, amount_rp, status, reference_note, paid_at, created_at)
         SELECT id, order_id, method, amount_rp, status, reference_note, paid_at, created_at FROM payments;`,
      );
      await db.execute(`DROP TABLE payments;`);
      await db.execute(`ALTER TABLE payments_v3 RENAME TO payments;`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);`);
    } else {
      await db.execute(`DROP TABLE payments_v3;`);
    }
  } catch {
    // Best-effort: void payment tetap opsional via tableSqlAllows di repository.
  }
}

async function ensureColumn(
  db: SQLiteDBConnection,
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  if (await tableHasColumn(db, table, column)) {
    return;
  }
  try {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl};`);
  } catch {
    // Balapan dengan upgrade path Capacitor atau kolom sudah ada.
  }
}

/**
 * V4: HPP yang bisa diatur user (manual / resep / tanpa HPP) + snapshot HPP
 * per baris order. Idempotent: dipanggil setiap kali koneksi dibuka.
 */
async function ensureV4Columns(db: SQLiteDBConnection): Promise<void> {
  await ensureColumn(db, "products", "hpp_mode", `hpp_mode TEXT NOT NULL DEFAULT 'manual'`);
  await ensureColumn(db, "products", "hpp_manual_rp", `hpp_manual_rp INTEGER NOT NULL DEFAULT 0`);
  await ensureColumn(db, "products", "hpp_updated_at", `hpp_updated_at TEXT`);
  await ensureColumn(db, "product_variants", "hpp_mode", `hpp_mode TEXT NOT NULL DEFAULT 'inherit'`);
  await ensureColumn(db, "product_variants", "hpp_manual_rp", `hpp_manual_rp INTEGER NOT NULL DEFAULT 0`);
  await ensureColumn(db, "product_variants", "hpp_updated_at", `hpp_updated_at TEXT`);
  await ensureColumn(db, "order_items", "hpp_unit_rp", `hpp_unit_rp INTEGER NOT NULL DEFAULT 0`);
  await ensureColumn(db, "order_items", "hpp_source", `hpp_source TEXT NOT NULL DEFAULT 'none'`);
  await ensureColumn(db, "order_items", "hpp_detail_json", `hpp_detail_json TEXT`);
}

export function getDb(): Promise<SQLiteDBConnection> {
  if (conn) {
    return Promise.resolve(conn);
  }
  if (!ready) {
    ready = openConnection().catch((e) => {
      ready = null;
      conn = null;
      throw e;
    });
  }
  return ready;
}

async function categoryCount(db: SQLiteDBConnection): Promise<number> {
  const res = await db.query(`SELECT COUNT(*) AS c FROM categories;`);
  const row = res.values?.[0] as { c?: number } | undefined;
  return typeof row?.c === "number" ? row.c : 0;
}

async function seedCatalog(db: SQLiteDBConnection): Promise<void> {
  const count = await categoryCount(db).catch(() => -1);
  if (count !== 0) {
    return;
  }
  const now = new Date().toISOString();
  const txn: { statement: string; values?: unknown[] }[] = [
    ...CATEGORIES.map((c) => ({
      statement:
        "INSERT INTO categories (id, name, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?);",
      values: [c.id, c.name, c.sortOrder, now, now],
    })),
    ...PRODUCTS.map((p) => ({
      statement:
        "INSERT INTO products (id, category_id, name, description, base_price_rp, is_active, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 1, ?, ?);",
      values: [p.id, p.categoryId, p.name, p.basePriceRp, now, now],
    })),
    ...VARIANTS.map((v) => ({
      statement:
        "INSERT INTO product_variants (id, product_id, name, price_delta_rp, is_active) VALUES (?, ?, ?, ?, 1);",
      values: [v.id, v.productId, v.name, v.priceDeltaRp],
    })),
  ];
  await db.executeTransaction(txn, false);
}
