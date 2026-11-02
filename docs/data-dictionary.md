# Data Dictionary

## Catalog
### categories
Menu grouping such as Coffee, Non-Coffee, Food.
- `id`: UUID.
- `name`: category display name.
- `sort_order`: display ordering.
- `is_active`: soft-disable flag.

### products
Sellable menu item.
- `category_id`: nullable category reference.
- `base_price_rp`: base selling price in whole Rupiah.
- `is_active`: hide from new sales without deleting history.

### product_variants
Optional size/variant such as Regular or Large.
- `price_delta_rp`: amount added to product base price. If variants have independent prices, replace this model with explicit variant price.

## HPP and recipe
### units_of_measure
Canonical units and conversion definitions. Conversion must be explicit and dimension-safe; do not convert mass to volume without a recipe-specific density.
- `dimension`: mass, volume, count, etc.
- `base_unit_multiplier`: proposed integer conversion factor; refine to support exact rational conversions.

### ingredients
Raw materials such as beans, milk, sugar, cups.
- `base_unit_id`: canonical unit used for stock and costing.

### ingredient_cost_history
Cost history for ingredients. A costing policy (weighted average, FIFO, or another approved method) must be selected with the client/accountant.
- `cost_per_base_unit_rp`: integer Rupiah per canonical base unit.
- `effective_at`: when this cost becomes effective.

### recipes / recipe_items
Recipe/BOM for one menu product and optionally one variant.
- Recipe version must be immutable once used by a sale; create a new version when recipe changes.
- Recipe item quantity is expressed in a declared unit and converted to ingredient base unit before calculation.

### order_item_cost_snapshots
Immutable ingredient-level HPP details captured at checkout.
- Snapshot records ingredient name, converted quantity, unit cost, and line cost as they were at sale time.
- Never recalculate historical order HPP from current recipe/cost tables.

## Sales
### orders
One checkout transaction.
- `status`: draft, completed, voided, refunded (define exact lifecycle with client).
- subtotal, discount, tax, total are integer Rupiah.
- Use an idempotency key/UUID to guard against duplicate checkout requests.

### order_items
Products and quantities sold in an order.
- Unit selling price and line total are snapshots.
- `hpp_total_rp` is HPP snapshot total at checkout.

### payments
Payment attempts/records. Manual QRIS recording is not automatic gateway confirmation.
- `method`: cash, qris_manual, other (confirm accepted methods).
- `status`: pending, paid, failed, refunded (define lifecycle with client).

## Inventory and purchasing
### stock_movements
Append-only stock ledger. Positive quantity adds stock; negative quantity consumes stock.
- `movement_type`: purchase_received, sale_consumption, waste, adjustment_in, adjustment_out, return_in, return_out.
- `reference_type` + `reference_id`: links to order, purchase, or adjustment.
- Every manual adjustment requires reason and actor/audit record.

### suppliers / purchases / purchase_items
Optional purchasing module. Keep out of MVP if client only needs HPP calculation and not purchasing workflow.

## Operations
### audit_logs
Record sensitive actions: price changes, recipe changes, stock adjustments, void/refund, restore, and role changes.

### sync_outbox
Durable offline event queue.
- `status`: pending, in_progress, acknowledged, failed (retryable/permanent failure distinction needed).
- Event ID is idempotency key at server.
- Preserve payload version/schema version for future compatibility.
