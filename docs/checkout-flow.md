# Checkout Transaction Flow

```mermaid
flowchart TD
    A[Cashier taps Pay] --> B[Validate cart and local product data]
    B --> C[Calculate subtotal, discount, tax and total]
    C --> D[Calculate HPP from active recipe and approved cost policy]
    D --> E[Begin SQLite transaction]
    E --> F[Insert order and order items]
    F --> G[Insert payment record]
    G --> H[Insert immutable HPP snapshots]
    H --> I{Inventory deduction approved?}
    I -- Yes --> J[Insert stock movement ledger rows]
    I -- No --> K[Skip stock movement]
    J --> L[Insert audit event and sync outbox]
    K --> L
    L --> M[Commit SQLite transaction]
    M --> N[Show completed order]
    N --> O[Attempt Bluetooth receipt print]
    O --> P{Print succeeded?}
    P -- Yes --> Q[Show print success]
    P -- No --> R[Show print error and allow reprint]
```

## Invariants
- If any critical insert fails, rollback the whole SQLite transaction.
- A committed order is not rolled back just because the printer is offline.
- Reprint references the existing order ID; it never creates a new order/payment.
- Use a unique order ID/idempotency key and disable accidental double-submit while checkout is processing.
- Confirm rounding, discount allocation, tax/service charge, and refund behavior with the client.
