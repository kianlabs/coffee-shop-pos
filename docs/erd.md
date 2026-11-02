# Entity Relationship Diagram

The diagram shows the proposed local operational data model. Some modules are conditional:
- Purchasing tables are needed only if purchase recording is in scope.
- Stock deduction from recipes requires client approval.
- User/role tables can be added if cashier/owner access control is required.

```mermaid
erDiagram
    CATEGORIES ||--o{ PRODUCTS : groups
    PRODUCTS ||--o{ PRODUCT_VARIANTS : has
    UNITS_OF_MEASURE ||--o{ INGREDIENTS : measures
    INGREDIENTS ||--o{ INGREDIENT_COST_HISTORY : has_cost_history
    UNITS_OF_MEASURE ||--o{ RECIPE_ITEMS : quantity_unit
    PRODUCTS ||--o{ RECIPES : has
    PRODUCT_VARIANTS o|--o{ RECIPES : variant_recipe
    RECIPES ||--|{ RECIPE_ITEMS : contains
    INGREDIENTS ||--o{ RECIPE_ITEMS : used_in

    ORDERS ||--|{ ORDER_ITEMS : contains
    PRODUCTS ||--o{ ORDER_ITEMS : sold_as
    PRODUCT_VARIANTS o|--o{ ORDER_ITEMS : selected_variant
    ORDERS ||--o{ PAYMENTS : paid_by
    ORDER_ITEMS ||--o{ ORDER_ITEM_MODIFIERS : has
    ORDER_ITEMS ||--o{ ORDER_ITEM_COST_SNAPSHOTS : cost_snapshot

    INGREDIENTS ||--o{ STOCK_MOVEMENTS : moved
    ORDERS o|--o{ STOCK_MOVEMENTS : may_trigger
    ORDER_ITEMS o|--o{ STOCK_MOVEMENTS : may_trigger

    SUPPLIERS o|--o{ PURCHASES : supplies
    PURCHASES ||--|{ PURCHASE_ITEMS : contains
    INGREDIENTS ||--o{ PURCHASE_ITEMS : purchased

    ORDERS ||--o{ AUDIT_LOGS : audited
    SYNC_OUTBOX }o--o| ORDERS : references
    SYNC_OUTBOX }o--o| PURCHASES : references

    CATEGORIES {
      TEXT id PK
      TEXT name
      INTEGER sort_order
      INTEGER is_active
    }
    PRODUCTS {
      TEXT id PK
      TEXT category_id FK
      TEXT name
      INTEGER base_price_rp
      INTEGER is_active
    }
    PRODUCT_VARIANTS {
      TEXT id PK
      TEXT product_id FK
      TEXT name
      INTEGER price_delta_rp
      INTEGER is_active
    }
    UNITS_OF_MEASURE {
      TEXT id PK
      TEXT code
      TEXT name
      TEXT dimension
      INTEGER base_unit_multiplier
    }
    INGREDIENTS {
      TEXT id PK
      TEXT base_unit_id FK
      TEXT name
      INTEGER is_active
    }
    INGREDIENT_COST_HISTORY {
      TEXT id PK
      TEXT ingredient_id FK
      INTEGER cost_per_base_unit_rp
      TEXT effective_at
    }
    RECIPES {
      TEXT id PK
      TEXT product_id FK
      TEXT variant_id FK
      TEXT version
      INTEGER is_active
    }
    RECIPE_ITEMS {
      TEXT id PK
      TEXT recipe_id FK
      TEXT ingredient_id FK
      TEXT quantity
      TEXT unit_id FK
    }
    ORDERS {
      TEXT id PK
      TEXT receipt_number
      TEXT status
      INTEGER subtotal_rp
      INTEGER discount_rp
      INTEGER tax_rp
      INTEGER total_rp
      TEXT created_at
    }
    ORDER_ITEMS {
      TEXT id PK
      TEXT order_id FK
      TEXT product_id FK
      TEXT variant_id FK
      INTEGER quantity
      INTEGER unit_price_rp
      INTEGER line_total_rp
      INTEGER hpp_total_rp
    }
    PAYMENTS {
      TEXT id PK
      TEXT order_id FK
      TEXT method
      INTEGER amount_rp
      TEXT status
      TEXT paid_at
    }
    ORDER_ITEM_COST_SNAPSHOTS {
      TEXT id PK
      TEXT order_item_id FK
      TEXT ingredient_id FK
      TEXT ingredient_name_snapshot
      TEXT quantity_base_unit
      INTEGER unit_cost_rp
      INTEGER line_cost_rp
    }
    STOCK_MOVEMENTS {
      TEXT id PK
      TEXT ingredient_id FK
      TEXT movement_type
      TEXT quantity_delta_base_unit
      TEXT reference_type
      TEXT reference_id
      TEXT created_at
    }
    SUPPLIERS {
      TEXT id PK
      TEXT name
    }
    PURCHASES {
      TEXT id PK
      TEXT supplier_id FK
      TEXT status
      INTEGER total_rp
      TEXT received_at
    }
    PURCHASE_ITEMS {
      TEXT id PK
      TEXT purchase_id FK
      TEXT ingredient_id FK
      TEXT quantity_base_unit
      INTEGER unit_cost_rp
      INTEGER line_total_rp
    }
    AUDIT_LOGS {
      TEXT id PK
      TEXT action
      TEXT entity_type
      TEXT entity_id
      TEXT created_at
    }
    SYNC_OUTBOX {
      TEXT id PK
      TEXT event_type
      TEXT aggregate_id
      TEXT payload_json
      TEXT status
      TEXT created_at
      TEXT acknowledged_at
    }
```

## Notes
- All IDs are UUID strings generated on the device.
- Money columns use integer Rupiah.
- Quantities use decimal text in this draft to avoid SQLite floating-point arithmetic. In implementation, define a fixed-precision strategy (for example integer milli-units) and enforce it consistently.
- `ORDER_ITEM_COST_SNAPSHOTS` preserves the cost composition at sale time. `ORDER_ITEMS.hpp_total_rp` stores the aggregate snapshot for fast reporting.
- `STOCK_MOVEMENTS` is an append-only ledger; current stock is calculated from movement sums or maintained as a transactionally updated projection.
- `SYNC_OUTBOX` is local durable queue. Do not delete pending rows before server acknowledgement.
