# Offline Sync Flow

```mermaid
sequenceDiagram
    participant POS as Android POS
    participant DB as Local SQLite
    participant Worker as Sync Worker
    participant API as Go API
    participant PG as PostgreSQL

    POS->>DB: Commit order + outbox event atomically
    Note over POS,DB: Checkout succeeds without internet
    Worker->>DB: Read pending outbox events
    Worker->>API: POST event with UUID/idempotency key
    API->>PG: Check processed event ID
    alt New event
        API->>PG: Persist event and business data
        API-->>Worker: Durable acknowledgement
    else Duplicate retry
        API-->>Worker: Return prior acknowledgement
    end
    Worker->>DB: Mark event acknowledged
```

## Rules
- Server must enforce a unique constraint on event ID.
- Client retries must be safe.
- Local event is marked acknowledged only after durable server acknowledgement.
- Do not delete local order data after sync.
- Conflict policy for product/recipe/stock edits must be specified before multi-device support.
- Cloud sync is optional and must not block local checkout.

## Status implementasi (Nov 2026)
- DEFAULT terkunci offline: `DEFAULT_SYNC_ENDPOINT=https://api.example.invalid`; `pushEvents/syncNow` menolak kirim selama masih default.
- Mock dev-only: `scripts/mock-sync-server.mjs` (`npm run mock:sync`, `GET /v1/health`, `POST /v1/sync/events`); `payload.__reject=true` → `rejected` agar panel Sync bisa diuji ack/retry/backoff tanpa server nyata.
- Tanpa server nyata + API key, operasional = offline-first + backup file (`docs/backup-recovery.md`); jangan klaim cloud aktif sebelum restore teruji.
