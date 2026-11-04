# Open Decisions — Client Confirmation Required

Do not silently convert these assumptions into requirements.

## Device and printer
- [ ] Exact tablet brand/model, Android version, chipset.
- [ ] Exact printer brand/model.
- [ ] Bluetooth profile: Classic SPP/RFCOMM or BLE.
- [ ] ESC/POS or vendor protocol; obtain manual/SDK.
- [ ] Logo file/brand asset and desired receipt placement.
- [ ] Confirm paper width 58 mm and actual printable width.
- [ ] Confirm auto-cutter, cash drawer, buzzer, and paper sensor if relevant.

## POS workflow
- [ ] One outlet only?
- [ ] Dine-in, takeaway, table number, order notes?
- [ ] Cash and manual QRIS only, or payment gateway?
- [x] Discounts, tax, service charge, rounding rules? DIKUNCI: service≥0, rounding≤0 floor
  (`calcTotal(subtotal,discount,tax,service,rounding)`; backup lama default 0).
- [ ] Refund/void policy and permission?
- [ ] Shift closing and cashier accountability?
- [ ] Cashier/owner roles, PIN/login, and audit requirements?

## HPP and inventory
- [x] Is inventory deduction from recipe required at checkout? YA, best-effort ON
  (`STOCK_DEDUCTION_ENABLED=true`; tanpa resep/V2 dilewati; error stok tak gagalkan kasir).
- [x] Which costing method is approved by owner/accountant? LAST-COST (`getLastCosts`, effective_at terbesar).
- [ ] Recipe units and conversions; density conversions if needed.
- [ ] Waste, stock opname, returns, and adjustment workflow?
- [ ] Is purchasing/supplier management in scope?

## Sync and backup
- [x] Offline vs cloud? DIKUNCI offline-first: DEFAULT `api.example.invalid` menolak kirim;
  mock dev-only `scripts/mock-sync-server.mjs`; operasional = backup file + restore teruji.
- [ ] Who owns cloud account and pays hosting/storage if free tier ends?
- [ ] Backup retention policy and restore responsibility?
- [ ] Who holds recovery key?
- [ ] What data may be included in cloud backup?
