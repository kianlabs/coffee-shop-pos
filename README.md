# Coffee Shop POS — Technical Blueprint

Status: **draft / baseline**, based on currently confirmed client requirements. Validate every open decision before production.

## Confirmed
- One Android tablet, 4 GB RAM / 64 GB storage.
- Offline-first POS.
- Local + cloud backup are desired.
- HPP (cost of goods sold) is required.
- Bluetooth desktop thermal receipt printer, 58 mm paper.
- Logo printing is desired, subject to printer support.
- Software cost target is Rp0 where practical; hosting/storage may still cost money.

## Proposed stack
- React + TypeScript + Vite
- Capacitor Android
- SQLite through a maintained native Capacitor plugin
- Optional Go API + PostgreSQL for cloud sync/backup
- Printer adapter via Capacitor native plugin / Android bridge

## Files
- `docs/erd.md` — Mermaid ERD
- `docs/data-dictionary.md` — entity and field explanations
- `docs/checkout-flow.md` — checkout transaction flow
- `docs/offline-sync-flow.md` — outbox sync flow
- `docs/printer-flow.md` — Bluetooth printer and logo flow
- `docs/hpp.md` — user-editable HPP (manual / recipe / none) and margin
- `docs/backup-recovery.md` — backup/recovery baseline
- `docs/open-decisions.md` — decisions that must be confirmed
- `database/sqlite-schema.sql` — proposed SQLite schema
- `api/openapi.yaml` — draft API contract for optional cloud sync

## Important design rules
1. SQLite on the tablet is the operational source of truth.
2. Checkout must work without internet.
3. Commit the sale locally before attempting to print.
4. Print failure must not create or duplicate a sale.
5. Use integer Rupiah amounts; do not use floating-point for money.
6. Preserve HPP snapshots on each sold order item.
7. Stock changes must be represented by stock movement records.
8. Sync events must be idempotent and retained until server acknowledgement.
9. Never claim cloud backup is active until configured and restore-tested.
10. This is a starting blueprint, not a production-certified schema. Review migrations, constraints, indexes, and business rules with real client workflows.

## Suggested implementation sequence
1. Confirm device Android version and printer exact model.
2. Build SQLite schema/migrations and repository layer.
3. Implement a single offline checkout vertical slice.
4. Test transaction rollback, restart, airplane mode, and duplicate taps.
5. Add recipe/HPP and inventory only after confirming costing and stock policies.
6. Integrate printer and test 58 mm output/logo on physical hardware.
7. Add cloud sync/backup only after local operation and restore tests are reliable.
