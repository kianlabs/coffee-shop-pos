export const DB_NAME = "coffee_shop_pos";
export const DB_VERSION = 6;

export const UPGRADE_V1: string[] = [
  `PRAGMA foreign_keys = ON;`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    category_id TEXT REFERENCES categories(id),
    name TEXT NOT NULL,
    description TEXT,
    base_price_rp INTEGER NOT NULL CHECK (base_price_rp >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(category_id, is_active);`,
  `CREATE TABLE IF NOT EXISTS product_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    name TEXT NOT NULL,
    price_delta_rp INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    UNIQUE(product_id, name)
  );`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    receipt_number TEXT NOT NULL UNIQUE,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('completed','voided','partially_refunded','refunded')),
    subtotal_rp INTEGER NOT NULL CHECK (subtotal_rp >= 0),
    discount_rp INTEGER NOT NULL DEFAULT 0 CHECK (discount_rp >= 0),
    tax_rp INTEGER NOT NULL DEFAULT 0 CHECK (tax_rp >= 0),
    service_charge_rp INTEGER NOT NULL DEFAULT 0 CHECK (service_charge_rp >= 0),
    total_rp INTEGER NOT NULL CHECK (total_rp >= 0),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    product_id TEXT REFERENCES products(id),
    variant_id TEXT REFERENCES product_variants(id),
    product_name_snapshot TEXT NOT NULL,
    variant_name_snapshot TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_rp INTEGER NOT NULL CHECK (unit_price_rp >= 0),
    discount_rp INTEGER NOT NULL DEFAULT 0 CHECK (discount_rp >= 0),
    line_total_rp INTEGER NOT NULL CHECK (line_total_rp >= 0),
    hpp_total_rp INTEGER NOT NULL DEFAULT 0 CHECK (hpp_total_rp >= 0),
    recipe_version_snapshot INTEGER,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);`,
  `CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    method TEXT NOT NULL CHECK (method IN ('cash','qris_manual','other')),
    amount_rp INTEGER NOT NULL CHECK (amount_rp >= 0),
    status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','refunded')),
    reference_note TEXT,
    paid_at TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    reason TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);`,
  `CREATE TABLE IF NOT EXISTS sync_outbox (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','in_progress','acknowledged','failed')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    acknowledged_at TEXT
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending
    ON sync_outbox(status, next_attempt_at, created_at);`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
];

/**
 * UPGRADE_V2 — HPP + stok (TABEL BARU SAJA, tidak menyentuh tabel V1).
 *
 * DEFAULT: costing LAST-COST (cost efektif terakhir per ingredient dari
 * `ingredient_cost_history` terurut `effective_at` DESC). Cara ganti ke
 * average/FIFO kelak: tambah kolom/tabel lot (qty, cost, received_at) lalu
 * ganti resolver cost di `src/domain/hpp.ts` (satu fungsi) — skema V2 ini
 * tidak perlu diubah selain tambah tabel lot.
 *
 * Wired di `src/data/db.ts` (addUpgradeStatement V1→V2→V3 + DB_VERSION=3).
 * Fresh install: plugin menjalankan V1 lalu V2 lalu V3 berurutan.
 * Upgrade dari V1 lama: V2/V3 hanya menambah kolom/tabel baru, data order lama utuh.
 */
export const UPGRADE_V2: string[] = [
  `CREATE TABLE IF NOT EXISTS ingredients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    base_unit TEXT NOT NULL,
    stock_qty REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS ingredient_cost_history (
    id TEXT PRIMARY KEY,
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    cost_per_unit_rp INTEGER NOT NULL CHECK (cost_per_unit_rp >= 0),
    effective_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE INDEX IF NOT EXISTS idx_cost_history_ingredient_effective
    ON ingredient_cost_history(ingredient_id, effective_at DESC);`,
  `CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    variant_id TEXT REFERENCES product_variants(id),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_recipes_product_variant
    ON recipes(product_id, variant_id, is_active);`,
  `CREATE TABLE IF NOT EXISTS recipe_items (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id),
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    qty_per_unit REAL NOT NULL CHECK (qty_per_unit > 0)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe
    ON recipe_items(recipe_id);`,
  `CREATE TABLE IF NOT EXISTS order_item_cost_snapshots (
    id TEXT PRIMARY KEY,
    order_item_id TEXT NOT NULL REFERENCES order_items(id),
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    ingredient_name TEXT NOT NULL,
    qty REAL NOT NULL CHECK (qty > 0),
    cost_per_unit_rp INTEGER NOT NULL CHECK (cost_per_unit_rp >= 0),
    line_cost_rp INTEGER NOT NULL CHECK (line_cost_rp >= 0),
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_cost_snapshots_order_item
    ON order_item_cost_snapshots(order_item_id);`,
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY,
    ingredient_id TEXT REFERENCES ingredients(id),
    product_id TEXT REFERENCES products(id),
    qty REAL NOT NULL,
    movement_type TEXT NOT NULL CHECK (movement_type IN (
      'purchase_received','sale_consumption','waste',
      'adjustment_in','adjustment_out','return_in','return_out')),
    reference_type TEXT,
    reference_id TEXT,
    reason TEXT,
    actor TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_ingredient
    ON stock_movements(ingredient_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_reference
    ON stock_movements(reference_type, reference_id);`,
];

/**
 * UPGRADE_V3 — kolom rounding di orders + status 'voided' untuk payments.
 * SQLite lama tidak mendukung `ADD COLUMN IF NOT EXISTS`, sehingga migrasi
 * dijalankan via `ensureV3Columns()` di db.ts yang mengecek `PRAGMA
 * table_info` dulu (aman diulang). Daftar ini dipakai untuk fresh-install
 * path sekaligus dokumentasi kolom baru.
 */
export const UPGRADE_V3: string[] = [
  `ALTER TABLE orders ADD COLUMN rounding_rp INTEGER NOT NULL DEFAULT 0;`,
];

/**
 * UPGRADE_V4 — HPP yang bisa diatur user.
 *
 * Sebelumnya HPP hanya bisa dari resep (ingredients → recipes). Banyak warung
 * kopi tidak mau mencatat resep; mereka tahu "HPP kopi susu = 6.000". V4
 * menambah mode per produk/varian:
 *   manual  → user mengisi hpp_manual_rp sendiri
 *   recipe  → dihitung dari resep aktif (perilaku V2)
 *   none    → tidak dilacak
 * Varian: `inherit` (default) ikut produk, atau override sendiri.
 *
 * order_items menyimpan snapshot HPP saat transaksi (hpp_unit_rp, hpp_source,
 * hpp_detail_json) supaya laporan laba historis tidak berubah saat harga
 * bahan naik. hpp_total_rp (V1) tetap = hpp_unit_rp × quantity.
 *
 * Sama seperti V3: SQLite tidak punya `ADD COLUMN IF NOT EXISTS`, jadi
 * `ensureV4Columns()` di db.ts mengecek PRAGMA table_info dulu. Daftar ini
 * dipakai untuk fresh install (upgrade statement Capacitor) sekaligus
 * dokumentasi kolom.
 */
export const UPGRADE_V4: string[] = [
  `ALTER TABLE products ADD COLUMN hpp_mode TEXT NOT NULL DEFAULT 'manual';`,
  `ALTER TABLE products ADD COLUMN hpp_manual_rp INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE products ADD COLUMN hpp_updated_at TEXT;`,
  `ALTER TABLE product_variants ADD COLUMN hpp_mode TEXT NOT NULL DEFAULT 'inherit';`,
  `ALTER TABLE product_variants ADD COLUMN hpp_manual_rp INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE product_variants ADD COLUMN hpp_updated_at TEXT;`,
  `ALTER TABLE order_items ADD COLUMN hpp_unit_rp INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE order_items ADD COLUMN hpp_source TEXT NOT NULL DEFAULT 'none';`,
  `ALTER TABLE order_items ADD COLUMN hpp_detail_json TEXT;`,
];

/**
 * UPGRADE_V5 — penjaga idempotensi & integritas.
 *
 * Index unik ini yang membuat retry aman:
 * - satu movement `sale_consumption`/`return_in` per (order, ingredient)
 *   → konsumsi stok dan pembalikan void tidak bisa dobel.
 * - satu snapshot HPP per (order_item, ingredient).
 * - satu resep aktif per (product, variant) → tidak ada lagi `LIMIT 1` acak.
 *
 * Memakai `CREATE UNIQUE INDEX IF NOT EXISTS` (idempotent), bukan ALTER TABLE,
 * supaya aman dijalankan berulang di DB lama.
 */
export const UPGRADE_V5: string[] = [
  // Rapikan duplikat lama dulu — kalau tidak, CREATE UNIQUE INDEX gagal.
  `UPDATE recipes SET is_active = 0
     WHERE is_active = 1 AND rowid NOT IN (
       SELECT MIN(rowid) FROM recipes WHERE is_active = 1 GROUP BY product_id, IFNULL(variant_id, '')
     );`,
  `DELETE FROM order_item_cost_snapshots
     WHERE rowid NOT IN (
       SELECT MIN(rowid) FROM order_item_cost_snapshots GROUP BY order_item_id, ingredient_id
     );`,
  `DELETE FROM stock_movements
     WHERE reference_type IN ('order', 'order_void') AND rowid NOT IN (
       SELECT MIN(rowid) FROM stock_movements
       WHERE reference_type IN ('order', 'order_void')
       GROUP BY reference_type, reference_id, movement_type, ingredient_id
     );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_ref
     ON stock_movements(reference_type, reference_id, movement_type, ingredient_id)
     WHERE reference_type IN ('order', 'order_void');`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_snapshot_item
     ON order_item_cost_snapshots(order_item_id, ingredient_id);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_recipes_active
     ON recipes(product_id, IFNULL(variant_id, ''))
     WHERE is_active = 1;`,
];

/**
 * UPGRADE_V6 — mulai dari menu kosong.
 *
 * Menu contoh versi lama dimatikan supaya kasir menampilkan daftar kosong dan
 * pemilik mengisi menunya sendiri lewat layar Menu. Riwayat transaksi tetap
 * utuh karena order menyimpan snapshot nama & harga.
 */
export const UPGRADE_V6: string[] = [
  `UPDATE products SET is_active = 0
     WHERE id IN ('prod-kopi-susu','prod-kopi-tubruk','prod-americano','prod-matcha','prod-teh','prod-roti')
       AND is_active = 1;`,
  `UPDATE product_variants SET is_active = 0
     WHERE id IN ('var-kopi-susu-reg','var-kopi-susu-lg','var-americano-reg','var-americano-lg','var-matcha-reg','var-matcha-lg')
       AND is_active = 1;`,
];
