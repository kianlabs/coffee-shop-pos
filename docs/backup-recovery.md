# Backup and Recovery Baseline

## Local backup
- Daily backup, before app upgrade/schema migration, and manual export.
- Use SQLite Online Backup API or a verified consistent snapshot. Do not blindly copy a live database file.
- Include timestamp, app version, schema version, checksum, and backup format version.
- Encrypt backup; define owner recovery process for encryption key.
- Keep more than one known-good backup; never overwrite the only valid copy.

## Cloud backup
- Implement only after cloud API, authentication, storage, and costs are selected.
- Cloud backup must be separate from primary database failure domain where feasible.
- Keep local source data and pending sync events until server acknowledgement is durable.
- Do not describe cloud backup as active until a restore has been tested.

## Restore
1. Stop writes / enter maintenance mode.
2. Preserve current database as forensic copy where possible.
3. Restore into a separate database file.
4. Verify checksum, SQLite integrity, schema version, and record counts.
5. Validate recent orders, payments, HPP snapshots, and stock ledger.
6. Switch database only after validation and authorized approval.
7. Record restore in audit log.

## Recovery caveat
If the tablet is lost or destroyed while offline, transactions created after the last successful external backup may be unrecoverable. Explain this limitation to the owner.
