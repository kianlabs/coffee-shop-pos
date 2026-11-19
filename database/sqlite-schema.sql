-- Coffee Shop POS — Production SQLite Schema (V14)
-- Hasil menjalankan `src/data/migrations.ts` V1 sampai V14 pada database kosong.
-- Diperiksa oleh `node scripts/check-schema.mjs`: kolom yang ditambah lewat
-- ALTER TABLE ada di akhir tabel, sesuai urutan migrasinya.
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    category_id TEXT REFERENCES categories(id),
    name TEXT NOT NULL,
    description TEXT,
    base_price_rp INTEGER NOT NULL CHECK (base_price_rp >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    -- V4
    hpp_mode TEXT NOT NULL DEFAULT 'manual',
    hpp_manual_rp INTEGER NOT NULL DEFAULT 0,
    hpp_updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(category_id, is_active);
CREATE TABLE IF NOT EXISTS product_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    name TEXT NOT NULL,
    price_delta_rp INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    -- V4
    hpp_mode TEXT NOT NULL DEFAULT 'inherit',
    hpp_manual_rp INTEGER NOT NULL DEFAULT 0,
    hpp_updated_at TEXT,
    UNIQUE(product_id, name)
);
CREATE TABLE IF NOT EXISTS orders (
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
    updated_at TEXT NOT NULL,
    -- V3
    rounding_rp INTEGER NOT NULL DEFAULT 0,
    -- V12
    user_id TEXT REFERENCES users(id),
    shift_id TEXT REFERENCES shifts(id),
    order_type TEXT NOT NULL DEFAULT 'dine_in' CHECK (order_type IN ('dine_in','takeaway','delivery')),
    table_no TEXT,
    customer_name TEXT,
    customer_id TEXT,
    change_rp INTEGER NOT NULL DEFAULT 0 CHECK (change_rp >= 0),
    queue_no INTEGER,
    item_discount_rp INTEGER NOT NULL DEFAULT 0,
    promo_discount_rp INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE TABLE IF NOT EXISTS order_items (
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
    created_at TEXT NOT NULL,
    -- V4
    hpp_unit_rp INTEGER NOT NULL DEFAULT 0,
    hpp_source TEXT NOT NULL DEFAULT 'none',
    hpp_detail_json TEXT,
    -- V12
    note TEXT,
    charge_total_rp INTEGER NOT NULL DEFAULT 0 CHECK (charge_total_rp >= 0),
    refunded_qty INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_created ON order_items(order_id, created_at ASC);
-- V12: payments dibangun ulang (metode baru, status voided, split_id)
CREATE TABLE "payments" (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    method TEXT NOT NULL CHECK (method IN ('cash','qris_manual','card_edc','bank_transfer','other')),
    amount_rp INTEGER NOT NULL CHECK (amount_rp >= 0),
    status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','refunded','voided')),
    reference_note TEXT,
    paid_at TEXT,
    created_at TEXT NOT NULL,
    split_id TEXT
);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    reason TEXT,
    created_at TEXT NOT NULL,
    -- V8
    approver_id TEXT,
    action_type TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
-- V8: audit_logs hanya boleh ditambah.
CREATE TRIGGER IF NOT EXISTS trg_audit_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_audit_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;
CREATE TABLE IF NOT EXISTS sync_outbox (
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
);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending
ON sync_outbox(status, next_attempt_at, created_at);
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    -- V8
    updated_by TEXT
);
-- V2: HPP dan stok
-- V11: ingredients dibangun ulang (stock_milli, min_stock_milli)
CREATE TABLE "ingredients" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    base_unit TEXT NOT NULL,
    stock_milli INTEGER NOT NULL DEFAULT 0,
    min_stock_milli INTEGER,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ingredient_cost_history (
    id TEXT PRIMARY KEY,
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    cost_per_unit_rp INTEGER NOT NULL CHECK (cost_per_unit_rp >= 0),
    effective_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_cost_history_ingredient_effective
ON ingredient_cost_history(ingredient_id, effective_at DESC);
CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    variant_id TEXT REFERENCES product_variants(id),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recipes_product_variant
ON recipes(product_id, variant_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recipes_active
ON recipes(product_id, IFNULL(variant_id, ''))
WHERE is_active = 1;
CREATE TABLE IF NOT EXISTS recipe_items (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id),
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    qty_per_unit REAL NOT NULL CHECK (qty_per_unit > 0)
);
CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe ON recipe_items(recipe_id);
CREATE TABLE IF NOT EXISTS order_item_cost_snapshots (
    id TEXT PRIMARY KEY,
    order_item_id TEXT NOT NULL REFERENCES order_items(id),
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    ingredient_name TEXT NOT NULL,
    qty REAL NOT NULL CHECK (qty > 0),
    cost_per_unit_rp INTEGER NOT NULL CHECK (cost_per_unit_rp >= 0),
    line_cost_rp INTEGER NOT NULL CHECK (line_cost_rp >= 0),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_snapshots_order_item ON order_item_cost_snapshots(order_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_snapshot_item ON order_item_cost_snapshots(order_item_id, ingredient_id);
-- V11: stock_movements dibangun ulang (qty_milli)
CREATE TABLE "stock_movements" (
    id TEXT PRIMARY KEY,
    ingredient_id TEXT REFERENCES ingredients(id),
    product_id TEXT REFERENCES products(id),
    qty_milli INTEGER NOT NULL,
    movement_type TEXT NOT NULL CHECK (movement_type IN (
        'purchase_received','sale_consumption','waste',
        'adjustment_in','adjustment_out','return_in','return_out')),
    reference_type TEXT,
    reference_id TEXT,
    reason TEXT,
    actor TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_stock_movements_ingredient ON stock_movements(ingredient_id, created_at DESC);
CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
CREATE UNIQUE INDEX uq_stock_movements_ref
ON stock_movements(reference_type, reference_id, movement_type, ingredient_id)
WHERE reference_type IN ('order', 'order_void', 'order_refund');
CREATE TABLE order_item_consumption (
    order_item_id TEXT NOT NULL REFERENCES order_items(id),
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    qty_milli INTEGER NOT NULL CHECK (qty_milli > 0),
    PRIMARY KEY (order_item_id, ingredient_id)
);
-- V8: modul opsional
CREATE TABLE IF NOT EXISTS modules (
    id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
    enabled_at TEXT,
    updated_by TEXT
);
-- V9: pengguna
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    display_name_ci TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner','supervisor','kasir')),
    pin_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    locked_at INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_users_name_active ON users(display_name_ci) WHERE is_active = 1;
-- V10: shift, kas, keranjang, pesanan ditahan
CREATE TABLE shifts (
    id TEXT PRIMARY KEY,
    opened_by TEXT NOT NULL REFERENCES users(id),
    opened_at TEXT NOT NULL,
    opening_cash_rp INTEGER NOT NULL CHECK (opening_cash_rp >= 0),
    status TEXT NOT NULL CHECK (status IN ('terbuka','ditutup')),
    closed_by TEXT REFERENCES users(id),
    closed_at TEXT,
    counted_cash_rp INTEGER,
    expected_cash_rp INTEGER,
    variance_rp INTEGER,
    variance_reason TEXT
);
CREATE UNIQUE INDEX uq_one_open_shift ON shifts(status) WHERE status = 'terbuka';
CREATE TABLE cash_entries (
    id TEXT PRIMARY KEY,
    shift_id TEXT NOT NULL REFERENCES shifts(id),
    kind TEXT NOT NULL CHECK (kind IN ('in','out','expense')),
    amount_rp INTEGER NOT NULL CHECK (amount_rp > 0),
    reason TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
);
CREATE INDEX idx_cash_entries_shift ON cash_entries(shift_id);
CREATE TABLE carts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE held_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    label TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    held_at TEXT NOT NULL
);
-- V12: modifier, refund
CREATE TABLE order_item_modifiers (
    id TEXT PRIMARY KEY,
    order_item_id TEXT NOT NULL REFERENCES order_items(id),
    modifier_id TEXT,
    name_snapshot TEXT NOT NULL,
    price_delta_rp INTEGER NOT NULL DEFAULT 0,
    hpp_rp INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_order_item_modifiers_item ON order_item_modifiers(order_item_id);
CREATE TABLE refunds (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    idempotency_key TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('void','full','partial')),
    amount_rp INTEGER NOT NULL CHECK (amount_rp >= 0),
    method TEXT NOT NULL,
    reason TEXT NOT NULL,
    executed_by TEXT NOT NULL REFERENCES users(id),
    approved_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL
);
CREATE INDEX idx_refunds_order ON refunds(order_id);
CREATE TABLE refund_items (
    refund_id TEXT NOT NULL REFERENCES refunds(id),
    order_item_id TEXT NOT NULL REFERENCES order_items(id),
    qty INTEGER NOT NULL CHECK (qty >= 1),
    amount_rp INTEGER NOT NULL CHECK (amount_rp >= 0),
    PRIMARY KEY (refund_id, order_item_id)
);
-- V13: supplier, pembelian, opname
CREATE TABLE suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_ci TEXT NOT NULL UNIQUE,
    contact TEXT,
    note TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE stock_purchases (
    id TEXT PRIMARY KEY,
    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    qty_milli INTEGER NOT NULL CHECK (qty_milli > 0),
    total_rp INTEGER NOT NULL CHECK (total_rp BETWEEN 0 AND 999999999),
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
);
CREATE INDEX idx_stock_purchases_ingredient ON stock_purchases(ingredient_id, created_at DESC);
CREATE TABLE stocktakes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE stocktake_items (
    stocktake_id TEXT NOT NULL REFERENCES stocktakes(id),
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    system_milli INTEGER NOT NULL,
    physical_milli INTEGER NOT NULL CHECK (physical_milli >= 0),
    PRIMARY KEY (stocktake_id, ingredient_id)
);
-- V14: printing
CREATE TABLE printers (
    id TEXT PRIMARY KEY,
    alias TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('receipt','kitchen')),
    paper TEXT NOT NULL CHECK (paper IN ('58mm','80mm'))
);
CREATE TABLE print_routes (
    category_id TEXT PRIMARY KEY REFERENCES categories(id),
    printer_id TEXT NOT NULL REFERENCES printers(id)
);
CREATE TABLE unprinted_receipts (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    kind TEXT NOT NULL CHECK (kind IN ('receipt','kitchen','bar','refund','z_report')),
    printer_id TEXT,
    refund_id TEXT,
    created_at TEXT NOT NULL,
    last_error TEXT
);
CREATE INDEX idx_unprinted_receipts_order ON unprinted_receipts(order_id);
