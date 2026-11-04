import { getDb } from "./db";

/**
 * Client sync untuk sync_outbox -> POST /v1/sync/events (lihat api/openapi.yaml).
 * Local checkout TIDAK PERNAH bergantung pada modul ini (fire-and-forget saja).
 *
 * DEFAULT (aman, mudah diganti):
 * - DEFAULT_ENDPOINT = "https://api.example.invalid" — syncNow MENOLAK kirim
 *   selama endpoint masih *.example.invalid. Ganti via panel Sync di App
 *   (tersimpan di localStorage `pos.sync.v1`) atau konstanta di bawah.
 * - Backoff: 30 detik * 2^attempt, dibatasi 1 jam (BACKOFF_BASE_SEC/MAX).
 * - Batch: max 100 event per sync (SYNC_BATCH_LIMIT).
 */

// ---------------------------------------------------------------------------
// Konstanta DEFAULT — ganti di sini bila kontrak server berubah.
// ----------------------------------------------------------------------------

/** DEFAULT: endpoint placeholder yang tidak akan pernah dikirimi data nyata. */
export const DEFAULT_SYNC_ENDPOINT = "https://api.example.invalid";

/** Kunci settings sync di localStorage. */
export const SYNC_SETTINGS_KEY = "pos.sync.v1";

/** Kunci metadata status sync terakhir di localStorage. */
export const SYNC_META_KEY = "pos.sync.meta.v1";

const SYNC_BATCH_LIMIT = 100;
const BACKOFF_BASE_SEC = 30;
const BACKOFF_MAX_SEC = 3600;

// ---------------------------------------------------------------------------
// Tipe
// ----------------------------------------------------------------------------

export type SyncOutboxEvent = {
  /** sync_outbox.id — dipakai sebagai event_id (idempoten di server). */
  id: string;
  eventType: string;
  schemaVersion: number;
  /** ISO date-time dari sync_outbox.created_at — dipakai occurred_at. */
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type SyncSettings = {
  endpoint: string;
  apiKey: string;
  deviceId: string;
};

export type SyncMeta = {
  lastSyncAt: string | null;
  lastError: string | null;
  lastPushed: number;
};

export type SyncResult = {
  pushed: number;
  acked: string[];
  rejected: { event_id: string; code: string; message: string }[];
  pending: number;
};

// ---------------------------------------------------------------------------
// Settings (localStorage; device_id random tersimpan, dibuat sekali)
// ----------------------------------------------------------------------------

function newDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `dev-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function readJson(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function loadSyncSettings(): SyncSettings {
  const saved = readJson(SYNC_SETTINGS_KEY);
  let deviceId = typeof saved?.deviceId === "string" ? saved.deviceId : "";
  if (!deviceId) {
    deviceId = newDeviceId();
    saveSyncSettings({
      endpoint:
        typeof saved?.endpoint === "string" && saved.endpoint
          ? saved.endpoint
          : DEFAULT_SYNC_ENDPOINT,
      apiKey: typeof saved?.apiKey === "string" ? saved.apiKey : "",
      deviceId,
    });
  }
  return {
    endpoint:
      typeof saved?.endpoint === "string" && saved.endpoint
        ? saved.endpoint
        : DEFAULT_SYNC_ENDPOINT,
    apiKey: typeof saved?.apiKey === "string" ? saved.apiKey : "",
    deviceId,
  };
}

export function saveSyncSettings(s: SyncSettings): void {
  try {
    localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Best-effort: sync tetap bisa jalan sekali tanpa persist.
  }
}

export function loadSyncMeta(): SyncMeta {
  const saved = readJson(SYNC_META_KEY);
  return {
    lastSyncAt: typeof saved?.lastSyncAt === "string" ? saved.lastSyncAt : null,
    lastError: typeof saved?.lastError === "string" ? saved.lastError : null,
    lastPushed: typeof saved?.lastPushed === "number" ? saved.lastPushed : 0,
  };
}

export function saveSyncMeta(m: SyncMeta): void {
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(m));
  } catch {
    // Best-effort.
  }
}

// ---------------------------------------------------------------------------
// Outbox: baca langsung dari SQLite (sumber real).
// Backend browser (localStorage) tidak punya outbox -> pending 0.
// ----------------------------------------------------------------------------

type OutboxRow = {
  id: string;
  event_type: string;
  schema_version: number;
  payload_json: string;
  created_at: string;
};

/**
 * Baca event pending yang sudah jatuh tempo (next_attempt_at NULL/lewat).
 * Di browser tanpa SQLite mengembalikan [] (bukan error) agar panel Sync
 * tetap tampil dengan status "0 pending".
 */
export async function readPendingOutbox(limit = SYNC_BATCH_LIMIT): Promise<SyncOutboxEvent[]> {
  let db;
  try {
    db = await getDb();
  } catch {
    return [];
  }
  const now = new Date().toISOString();
  let res;
  try {
    res = await db.query(
      `SELECT id, event_type, schema_version, payload_json, created_at FROM sync_outbox
       WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
       ORDER BY created_at ASC LIMIT ?;`,
      [now, limit],
    );
  } catch {
    return [];
  }
  const rows = (Array.isArray(res.values) ? res.values : []) as OutboxRow[];
  const out: SyncOutboxEvent[] = [];
  for (const r of rows) {
    let payload: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(r.payload_json);
      if (typeof parsed === "object" && parsed !== null) {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      // Payload rusak: kirim objek kosong agar server bisa me-reject eksplisit.
    }
    out.push({
      id: r.id,
      eventType: r.event_type,
      schemaVersion: Number.isInteger(r.schema_version) ? r.schema_version : 1,
      occurredAt: r.created_at,
      payload,
    });
  }
  return out;
}

/** Hitung semua baris pending (untuk badge status), tanpa batas batch. */
export async function countPendingOutbox(): Promise<number> {
  let db;
  try {
    db = await getDb();
  } catch {
    return 0;
  }
  try {
    const res = await db.query(
      `SELECT COUNT(*) AS c FROM sync_outbox WHERE status = 'pending';`,
    );
    const row = res.values?.[0] as { c?: number } | undefined;
    return typeof row?.c === "number" ? row.c : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Push + ack (kompatibel api/openapi.yaml POST /v1/sync/events)
// ----------------------------------------------------------------------------

export function isDefaultEndpoint(endpoint: string): boolean {
  return endpoint.trim().replace(/\/+$/, "") === DEFAULT_SYNC_ENDPOINT;
}

type PushResponse = {
  acknowledged_event_ids: string[];
  rejected: { event_id: string; code: string; message: string }[];
};

export async function pushEvents(
  endpoint: string,
  apiKey: string,
  deviceId: string,
  events: SyncOutboxEvent[],
): Promise<PushResponse> {
  const base = endpoint.trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error("Endpoint sync belum diisi.");
  }
  if (isDefaultEndpoint(base)) {
    throw new Error(
      "Endpoint sync masih default (api.example.invalid) — ganti dengan URL server dulu.",
    );
  }
  const res = await fetch(`${base}/v1/sync/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      device_id: deviceId,
      events: events.map((e) => ({
        event_id: e.id,
        event_type: e.eventType,
        schema_version: e.schemaVersion,
        occurred_at: e.occurredAt,
        payload: e.payload,
      })),
    }),
  });
  if (res.status === 401) {
    throw new Error("Sync ditolak (401): API key salah atau hilang.");
  }
  if (res.status === 409) {
    throw new Error("Sync konflik (409): perlu rekonsiliasi manual di server.");
  }
  if (!res.ok) {
    throw new Error(`Sync gagal (HTTP ${res.status}).`);
  }
  const body: unknown = await res.json().catch(() => null);
  const obj = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  return {
    acknowledged_event_ids: Array.isArray(obj.acknowledged_event_ids)
      ? (obj.acknowledged_event_ids as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    rejected: Array.isArray(obj.rejected) ? (obj.rejected as PushResponse["rejected"]) : [],
  };
}

/** Tandai event yang di-ack server sebagai durable (tidak dikirim ulang). */
export async function markAcked(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const now = new Date().toISOString();
  // UPDATE satu-per-satu agar kompatibel dengan binding positional SQLite.
  for (const id of ids) {
    await db.run(
      `UPDATE sync_outbox SET status = 'acknowledged', acknowledged_at = ?, last_error = NULL WHERE id = ?;`,
      [now, id],
    );
  }
}

/** Backoff eksponensial manual: 30s * 2^attempt, maks 1 jam. Hasil ISO string. */
export function computeNextAttemptAt(attemptCount: number, nowMs = Date.now()): string {
  const delaySec = Math.min(BACKOFF_MAX_SEC, BACKOFF_BASE_SEC * 2 ** Math.max(0, attemptCount));
  return new Date(nowMs + delaySec * 1000).toISOString();
}

/** Naikkan attempt_count + jadwalkan percobaan berikut + simpan pesan error. */
export async function markRetry(ids: string[], message: string): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  for (const id of ids) {
    let attempt = 0;
    try {
      const res = await db.query(`SELECT attempt_count AS a FROM sync_outbox WHERE id = ?;`, [id]);
      const row = res.values?.[0] as { a?: number } | undefined;
      attempt = typeof row?.a === "number" ? row.a : 0;
    } catch {
      attempt = 0;
    }
    await db.run(
      `UPDATE sync_outbox SET attempt_count = ?, next_attempt_at = ?, last_error = ? WHERE id = ?;`,
      [attempt + 1, computeNextAttemptAt(attempt), message.slice(0, 500), id],
    );
  }
}

// ---------------------------------------------------------------------------
// Orkestrasi satu putaran sync (dipanggil tombol manual + interval App).
// ----------------------------------------------------------------------------

export async function syncNow(settings?: SyncSettings): Promise<SyncResult> {
  const s = settings ?? loadSyncSettings();
  const events = await readPendingOutbox();
  if (events.length === 0) {
    const meta = loadSyncMeta();
    saveSyncMeta({ ...meta, lastSyncAt: new Date().toISOString(), lastError: null, lastPushed: 0 });
    return { pushed: 0, acked: [], rejected: [], pending: await countPendingOutbox() };
  }
  let resp: PushResponse;
  try {
    resp = await pushEvents(s.endpoint, s.apiKey, s.deviceId, events);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync gagal.";
    // Endpoint default / offline bukan kesalahan DB: jangan naikkan attempt agar
    // tidak membanjiri next_attempt_at; cukup catat ke meta.
    const isLocalGuard =
      msg.includes("masih default") || (e instanceof TypeError && /fetch|network|offline/i.test(String(e)));
    if (!isLocalGuard) {
      await markRetry(
        events.map((ev) => ev.id),
        msg,
      ).catch(() => undefined);
    }
    saveSyncMeta({ lastSyncAt: loadSyncMeta().lastSyncAt, lastError: msg, lastPushed: 0 });
    throw e instanceof Error ? e : new Error(msg);
  }
  const acked = resp.acknowledged_event_ids.filter((id) => events.some((e) => e.id === id));
  await markAcked(acked).catch(() => undefined);
  const rejectedIds = resp.rejected.map((r) => r.event_id);
  // Event yang tidak di-ack dan tidak di-reject: anggap belum terkirim -> retry.
  const unacked = events.map((e) => e.id).filter((id) => !acked.includes(id) && !rejectedIds.includes(id));
  if (unacked.length > 0) {
    await markRetry(unacked, "Tidak di-ack server, coba lagi.").catch(() => undefined);
  }
  if (rejectedIds.length > 0) {
    await markRetry(rejectedIds, "Ditolak server (lihat log), coba lagi.").catch(() => undefined);
  }
  saveSyncMeta({
    lastSyncAt: new Date().toISOString(),
    lastError: null,
    lastPushed: acked.length,
  });
  return { pushed: events.length, acked, rejected: resp.rejected, pending: await countPendingOutbox() };
}
