-- Coffee Shop POS — proposed SQLite schema
-- Draft only. Review with client and test migrations before production.
--
-- SUMBER KEBENARAN: `src/data/migrations.ts` (UPGRADE_V1..V4). File ini adalah
-- blueprint awal; beberapa tabel di sini belum ada di implementasi (mis.
-- units_of_measure) dan sebaliknya. Selalu cocokkan dengan migrations.ts.
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;

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
    -- HPP yang bisa diatur user (v4): 'manual' | 'recipe' | 'none'
    hpp_mode TEXT NOT NULL DEFAULT 'manual',
    hpp_manual_rp INTEGER NOT NULL DEFAULT 0 CHECK (hpp_manual_rp >= 0),
    hpp_updated_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(category_id, is_active);

CREATE TABLE IF NOT EXISTS product_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    name TEXT NOT NULL,
    price_delta_rp INTEGER NOT NULL DEFAULT 0,
    -- HPP varian (v4): 'inherit' | 'manual' | 'recipe' | 'none'
    hpp_mode TEXT NOT NULL DEFAULT 'inherit',
    hpp_manual_rp INTEGER NOT NULL DEFAULT 0 CHECK (hpp_manual_rp >= 0),
    hpp_updated_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    UNIQUE(product_id, name)
);

CREATE TABLE IF NOT EXISTS units_of_measure (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    dimension TEXT NOT NULL,
    -- Multiplier to a chosen base unit for this dimension.
    -- Replace with exact numerator/denominator if conversions require fractions.
    base_unit_multiplier INTEGER NOT NULL CHECK (base_unit_multiplier > 0)
);

CREATE TABLE IF NOT EXISTS ingredients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    base_unit_id TEXT NOT NULL REFERENCES units_of_measure(id),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingredient_cost_history (
    id TEXT PRIMARY KEY,
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    cost_per_base_unit_rp INTEGER NOT NULL CHECK (cost_per_base_unit_rp >= 0),
    costing_method TEXT NOT NULL,
    effective_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ingredient_cost_effective
ON ingredient_cost_history(ingredient_id, effective_at DESC);

CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    variant_id TEXT REFERENCES product_variants(id),
    version INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    effective_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(product_id, variant_id, version)
);

CREATE TABLE IF NOT EXISTS recipe_items (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id),
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    quantity_base_unit TEXT NOT NULL,
    created_at TEXT NOT NULL
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
    updated_at TEXT NOT NULL
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
    -- Snapshot HPP saat transaksi (v4). Tidak boleh dihitung ulang saat lapor.
    hpp_unit_rp INTEGER NOT NULL DEFAULT 0 CHECK (hpp_unit_rp >= 0),
    hpp_source TEXT NOT NULL DEFAULT 'none',
    hpp_detail_json TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    method TEXT NOT NULL CHECK (method IN ('cash','qris_manual','other')),
    amount_rp INTEGER NOT NULL CHECK (amount_rp >= 0),
    status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','refunded')),
    reference_note TEXT,
    paid_at TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

CREATE TABLE IF NOT EXISTS order_item_cost_snapshots (
    id TEXT PRIMARY KEY,
    order_item_id TEXT NOT NULL REFERENCES order_items(id),
    ingredient_id TEXT REFERENCES ingredients(id),
    ingredient_name_snapshot TEXT NOT NULL,
    quantity_base_unit TEXT NOT NULL,
    unit_cost_rp INTEGER NOT NULL CHECK (unit_cost_rp >= 0),
    line_cost_rp INTEGER NOT NULL CHECK (line_cost_rp >= 0),
    costing_method_snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_snapshots_order_item ON order_item_cost_snapshots(order_item_id);

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);

CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    supplier_id TEXT REFERENCES suppliers(id),
    status TEXT NOT NULL CHECK (status IN ('draft','received','cancelled')),
    total_rp INTEGER NOT NULL DEFAULT 0 CHECK (total_rp >= 0),
    received_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_items (
    id TEXT PRIMARY KEY,
    purchase_id TEXT NOT NULL REFERENCES purchases(id),
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    quantity_base_unit TEXT NOT NULL,
    unit_cost_rp INTEGER NOT NULL CHECK (unit_cost_rp >= 0),
    line_total_rp INTEGER NOT NULL CHECK (line_total_rp >= 0)
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY,
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    movement_type TEXT NOT NULL CHECK (movement_type IN (
        'purchase_received','sale_consumption','waste',
        'adjustment_in','adjustment_out','return_in','return_out'
    )),
    quantity_delta_base_unit TEXT NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    reason TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ingredient_date
ON stock_movements(ingredient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference
ON stock_movements(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    reason TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);

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
    updated_at TEXT NOT NULL
);

-- Notes:
-- 1) Create order + order_items + payments + HPP snapshots + stock movements
--    (if enabled) + audit + sync_outbox inside ONE SQLite transaction.
-- 2) Use integer base units or exact fixed-point arithmetic for quantities in production.
-- 3) Never hard-delete financial records; use void/refund workflows and audit logs.
-- 4) Add users/roles only after client confirms access-control requirements.
