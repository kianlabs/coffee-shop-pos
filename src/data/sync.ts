import { getDb } from "./db";
import { runSerializedWrite } from "./tx";

/**
 * Client sync untuk sync_outbox -> POST /v1/sync/events (lihat api/openapi.yaml).
 * Local checkout TIDAK PERNAH bergantung pada modul ini (fire-and-forget saja).
 *
 * Kebijakan (detail: docs/offline-sync-flow.md):
 * - Satu sync dalam satu waktu: `syncNow()` memakai lock modul, pemanggil kedua
 *   menerima promise yang sama (tidak ada request ganda dari interval + tombol).
 * - `fetch` selalu dibatasi timeout (SYNC_TIMEOUT_MS) dan bisa dibatalkan lewat `signal`.
 * - 2xx / 409 / `duplicate: true` -> acknowledged (tidak dikirim ulang).
 * - 429 / 5xx / 408 / network / timeout -> retry: attempt_count+1 + next_attempt_at (backoff).
 * - 400 / 401 / 403 / 404 / 422 -> status `failed` (terminal, TIDAK di-retry otomatis).
 *   Setelah endpoint/API key diperbaiki, panggil `requeueFailedEvents()`.
 * - event_id yang dikirim adalah UUID murni (openapi: format uuid), diturunkan
 *   deterministik dari sync_outbox.id agar retry tetap idempoten di server.
 *
 * DEFAULT (aman, mudah diganti):
 * - DEFAULT_ENDPOINT = "https://api.example.invalid" — syncNow MENOLAK kirim
 *   selama endpoint masih *.example.invalid. Ganti via panel Sync di App
 *   (endpoint + device_id tersimpan di localStorage `pos.sync.v1`).
 * - API key TIDAK disimpan di localStorage: hanya di memori + sessionStorage
 *   (`pos.sync.key.v1`), sehingga hilang saat aplikasi ditutup penuh.
 * - Backoff: 30 detik * 2^attempt, dibatasi 1 jam (BACKOFF_BASE_SEC/MAX).
 * - Batch: max 100 event per sync (SYNC_BATCH_LIMIT).
 */

// ---------------------------------------------------------------------------
// Konstanta DEFAULT — ganti di sini bila kontrak server berubah.
// ---------------------------------------------------------------------------

/** DEFAULT: endpoint placeholder yang tidak akan pernah dikirimi data nyata. */
export const DEFAULT_SYNC_ENDPOINT = "https://api.example.invalid";

/** Kunci settings sync (endpoint + device_id, TANPA API key) di localStorage. */
export const SYNC_SETTINGS_KEY = "pos.sync.v1";

/** API key hanya untuk sesi berjalan (sessionStorage; hilang saat app ditutup). */
export const SYNC_API_KEY_SESSION_KEY = "pos.sync.key.v1";

/** Kunci metadata status sync terakhir di localStorage. */
export const SYNC_META_KEY = "pos.sync.meta.v1";

/** Batas waktu satu request push (ms). */
export const SYNC_TIMEOUT_MS = 15_000;

const SYNC_BATCH_LIMIT = 100;
const BACKOFF_BASE_SEC = 30;
const BACKOFF_MAX_SEC = 3600;

// ---------------------------------------------------------------------------
// Tipe
// ----------------------------------------------------------------------------

export type SyncOutboxEvent = {
  /** sync_outbox.id — id lokal, TIDAK dikirim ke server. */
  id: string;
  /** UUID murni yang dikirim sebagai event_id (kunci idempotensi server). */
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  schemaVersion: number;
  /** ISO date-time dari sync_outbox.created_at — dipakai occurred_at. */
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type SyncSettings = {
  endpoint: string;
  /**
   * Hanya di memori + sessionStorage — TIDAK pernah ikut ditulis ke localStorage.
   * Hilang saat aplikasi ditutup penuh (bukan sekadar reload WebView).
   */
  apiKey: string;
  deviceId: string;
};

/** Bentuk yang boleh dipersistensikan ke localStorage. */
type PersistedSyncSettings = {
  endpoint: string;
  deviceId: string;
};

export type SyncMeta = {
  lastSyncAt: string | null;
  lastError: string | null;
  lastPushed: number;
};

export type SyncResult = {
  pushed: number;
  /** Id lokal (sync_outbox.id) yang di-ack, bukan UUID server. */
  acked: string[];
  rejected: { event_id: string; code: string; message: string }[];
  /** Id lokal yang ditandai `failed` pada putaran ini. */
  failed: string[];
  pending: number;
  duplicate: boolean;
};

/** Error konfigurasi lokal (endpoint kosong/default/non-https) — bukan salah event. */
export class SyncConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncConfigError";
  }
}

/** Error HTTP dari server, dengan klasifikasi retry. */
export class SyncHttpError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "SyncHttpError";
    this.status = status;
    this.retryable = retryable;
  }
}

// ---------------------------------------------------------------------------
// Settings (localStorage; device_id random tersimpan, dibuat sekali)
// ---------------------------------------------------------------------------

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

function readSessionApiKey(): string {
  try {
    return sessionStorage.getItem(SYNC_API_KEY_SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeSessionApiKey(apiKey: string): void {
  try {
    if (apiKey) {
      sessionStorage.setItem(SYNC_API_KEY_SESSION_KEY, apiKey);
    } else {
      sessionStorage.removeItem(SYNC_API_KEY_SESSION_KEY);
    }
  } catch {
    // Storage penuh / mode privat: key tetap hidup di memori sampai reload.
  }
}

function persistSyncSettings(s: PersistedSyncSettings): void {
  try {
    localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify({ endpoint: s.endpoint, deviceId: s.deviceId }));
  } catch {
    // Best-effort: sync tetap bisa jalan sekali tanpa persist.
  }
}

export function loadSyncSettings(): SyncSettings {
  const saved = readJson(SYNC_SETTINGS_KEY);
  const endpoint =
    typeof saved?.endpoint === "string" && saved.endpoint
      ? saved.endpoint
      : DEFAULT_SYNC_ENDPOINT;
  let deviceId = typeof saved?.deviceId === "string" ? saved.deviceId : "";
  const needsDeviceId = deviceId === "";
  if (needsDeviceId) {
    deviceId = newDeviceId();
  }

  // Migrasi dari versi lama: API key pernah tersimpan plaintext di localStorage.
  // Pindahkan ke sessionStorage lalu hapus field tersebut dari localStorage.
  let apiKey = readSessionApiKey();
  const legacyApiKey = typeof saved?.apiKey === "string" ? saved.apiKey : "";
  const hadLegacyApiKey = saved !== null && Object.prototype.hasOwnProperty.call(saved, "apiKey");
  if (legacyApiKey && !apiKey) {
    apiKey = legacyApiKey;
    writeSessionApiKey(apiKey);
  }
  if (needsDeviceId || hadLegacyApiKey) {
    persistSyncSettings({ endpoint, deviceId });
  }

  return { endpoint, apiKey, deviceId };
}

export function saveSyncSettings(s: SyncSettings): void {
  // Yang persisten hanya endpoint + device_id. API key sesi-only.
  persistSyncSettings({ endpoint: s.endpoint, deviceId: s.deviceId });
  writeSessionApiKey(s.apiKey);
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
// event_id: UUID murni & deterministik dari id lokal
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Turunkan UUID v4-shaped dari id lokal (FNV-1a 128-bit, 4 seed).
 * Deterministik: id lokal sama -> UUID sama -> retry tidak menduplikasi data.
 * JANGAN ubah algoritma ini tanpa migrasi; nilai ini kunci idempotensi server.
 */
export function eventIdFor(localId: string): string {
  if (UUID_RE.test(localId)) return localId.toLowerCase();
  const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  const bytes: number[] = [];
  for (const seed of seeds) {
    let h = seed >>> 0;
    for (let i = 0; i < localId.length; i++) {
      h ^= localId.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    bytes.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versi 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // varian RFC 4122
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---------------------------------------------------------------------------
// Outbox: baca langsung dari SQLite (sumber real).
// Backend browser (localStorage) tidak punya outbox -> pending 0.
// ----------------------------------------------------------------------------

type OutboxRow = {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
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
      `SELECT id, event_type, aggregate_type, aggregate_id, schema_version, payload_json, created_at
       FROM sync_outbox
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
      eventId: eventIdFor(r.id),
      eventType: r.event_type,
      aggregateType: typeof r.aggregate_type === "string" ? r.aggregate_type : "order",
      aggregateId: typeof r.aggregate_id === "string" ? r.aggregate_id : "",
      schemaVersion: Number.isInteger(r.schema_version) ? r.schema_version : 1,
      occurredAt: r.created_at,
      payload,
    });
  }
  return out;
}

/** Hitung baris pending (untuk badge status), tanpa batas batch. */
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

/** Hitung baris `failed` (terminal) — untuk diagnosa di panel Sync. */
export async function countFailedOutbox(): Promise<number> {
  let db;
  try {
    db = await getDb();
  } catch {
    return 0;
  }
  try {
    const res = await db.query(`SELECT COUNT(*) AS c FROM sync_outbox WHERE status = 'failed';`);
    const row = res.values?.[0] as { c?: number } | undefined;
    return typeof row?.c === "number" ? row.c : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Push + ack (kompatibel api/openapi.yaml POST /v1/sync/events)
// ---------------------------------------------------------------------------

export function isDefaultEndpoint(endpoint: string): boolean {
  return endpoint.trim().replace(/\/+$/, "") === DEFAULT_SYNC_ENDPOINT;
}

/**
 * Endpoint wajib https://. Pengecualian: http:// hanya untuk host loopback /
 * emulator (mock server dev): localhost, 127.0.0.1, ::1, dan 10.0.2.2 (Android
 * emulator -> host). API key dikirim sebagai Bearer token — jangan pernah
 * menulisnya ke console/log.
 */
export function isEndpointAllowed(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host === "10.0.2.2"
  );
}

export type PushResponse = {
  acknowledged_event_ids: string[];
  rejected: { event_id: string; code: string; message: string }[];
  duplicate: boolean;
};

export type PushOptions = {
  /** Signal eksternal (mis. batalkan saat komponen unmount). */
  signal?: AbortSignal;
  /** Override timeout; default SYNC_TIMEOUT_MS. */
  timeoutMs?: number;
};

/** fetch dengan timeout + signal eksternal. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  opts: PushOptions,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? SYNC_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const outer = opts.signal;
  const onAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", onAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (timedOut) {
      const label = timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)} detik` : `${timeoutMs} ms`;
      throw new Error(`Sync timeout setelah ${label}.`);
    }
    if (outer?.aborted) throw new Error("Sync dibatalkan.");
    throw e;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onAbort);
  }
}

async function readServerMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return "";
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.message === "string") return obj.message.slice(0, 300);
      if (typeof obj.error === "object" && obj.error !== null) {
        const err = obj.error as Record<string, unknown>;
        if (typeof err.message === "string") return err.message.slice(0, 300);
      }
    }
    return "";
  } catch {
    return "";
  }
}

export async function pushEvents(
  endpoint: string,
  apiKey: string,
  deviceId: string,
  events: SyncOutboxEvent[],
  opts: PushOptions = {},
): Promise<PushResponse> {
  const base = endpoint.trim().replace(/\/+$/, "");
  if (!base) {
    throw new SyncConfigError("Endpoint sync belum diisi.");
  }
  if (isDefaultEndpoint(base)) {
    throw new SyncConfigError(
      "Endpoint sync masih default (api.example.invalid) — ganti dengan URL server dulu.",
    );
  }
  if (!isEndpointAllowed(base)) {
    throw new SyncConfigError(
      "Endpoint sync wajib https:// (http:// hanya diizinkan untuk localhost).",
    );
  }
  const res = await fetchWithTimeout(
    `${base}/v1/sync/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // API key TIDAK pernah dicetak ke log/console.
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        device_id: deviceId,
        events: events.map((e) => ({
          event_id: e.eventId,
          event_type: e.eventType,
          aggregate_type: e.aggregateType,
          aggregate_id: e.aggregateId,
          schema_version: e.schemaVersion,
          occurred_at: e.occurredAt,
          payload: e.payload,
        })),
      }),
    },
    opts,
  );

  if (res.status === 409) {
    // Server mengenali event sebagai duplikat/konflik yang sudah tersimpan.
    return {
      acknowledged_event_ids: events.map((e) => e.eventId),
      rejected: [],
      duplicate: true,
    };
  }
  if (!res.ok) {
    const detail = await readServerMessage(res);
    const suffix = detail ? `: ${detail}` : "";
    if (res.status === 401) {
      throw new SyncHttpError(`Sync ditolak (401): API key salah atau hilang${suffix}`, 401, false);
    }
    if (res.status === 429) {
      throw new SyncHttpError(`Sync dibatasi server (429)${suffix}`, 429, true);
    }
    if (res.status >= 500 || res.status === 408 || res.status === 425) {
      throw new SyncHttpError(`Sync gagal sementara (HTTP ${res.status})${suffix}`, res.status, true);
    }
    // 400/403/404/422 dan 4xx lain: payload tidak akan pernah diterima.
    throw new SyncHttpError(`Sync ditolak permanen (HTTP ${res.status})${suffix}`, res.status, false);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    // 2xx tanpa body valid: status commit tidak pasti -> aman untuk retry (idempoten).
    throw new SyncHttpError("Respons server tidak valid (bukan JSON).", res.status, true);
  }
  const obj = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  return {
    acknowledged_event_ids: Array.isArray(obj.acknowledged_event_ids)
      ? (obj.acknowledged_event_ids as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    rejected: Array.isArray(obj.rejected) ? (obj.rejected as PushResponse["rejected"]) : [],
    duplicate: obj.duplicate === true,
  };
}

/** Tandai event yang di-ack server sebagai durable (tidak dikirim ulang). */
export async function markAcked(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const now = new Date().toISOString();
  const stmts = ids.map((id) => ({
    statement: `UPDATE sync_outbox SET status = 'acknowledged', acknowledged_at = ?, last_error = NULL, next_attempt_at = NULL WHERE id = ?;`,
    values: [now, id],
  }));
  await runSerializedWrite(() => db.executeTransaction(stmts, false));
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
  const attempts = new Map<string, number>();
  try {
    const placeholders = ids.map(() => "?").join(", ");
    const res = await db.query(
      `SELECT id, attempt_count AS a FROM sync_outbox WHERE id IN (${placeholders});`,
      ids,
    );
    for (const row of (res.values ?? []) as { id?: string; a?: number }[]) {
      if (row.id) {
        attempts.set(row.id, typeof row.a === "number" ? row.a : 0);
      }
    }
  } catch {
    // Abaikan error query; default attempt = 0
  }
  const err = message.slice(0, 500);
  const stmts = ids.map((id) => {
    const attempt = attempts.get(id) ?? 0;
    return {
      statement: `UPDATE sync_outbox SET attempt_count = ?, next_attempt_at = ?, last_error = ? WHERE id = ?;`,
      values: [attempt + 1, computeNextAttemptAt(attempt), err, id],
    };
  });
  await runSerializedWrite(() => db.executeTransaction(stmts, false));
}

/** Tandai event gagal permanen (4xx non-retryable). Tidak di-retry otomatis. */
export async function markFailed(ids: string[], message: string): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const err = message.slice(0, 500);
  const stmts = ids.map((id) => ({
    statement: `UPDATE sync_outbox SET status = 'failed', last_error = ?, next_attempt_at = NULL WHERE id = ?;`,
    values: [err, id],
  }));
  await runSerializedWrite(() => db.executeTransaction(stmts, false));
}

/**
 * Kembalikan event `failed` menjadi `pending` (attempt direset).
 * Dipanggil manual setelah endpoint/API key diperbaiki.
 */
export async function requeueFailedEvents(): Promise<void> {
  const db = await getDb();
  await runSerializedWrite(async () => {
    await db.run(
      `UPDATE sync_outbox SET status = 'pending', attempt_count = 0, next_attempt_at = NULL, last_error = NULL
       WHERE status = 'failed';`,
    );
  });
}

// ---------------------------------------------------------------------------
// Orkestrasi satu putaran sync (tombol manual + interval App).
// ----------------------------------------------------------------------------

/** Lock modul: hanya satu sync berjalan; pemanggil lain menerima promise yang sama. */
let inFlight: Promise<SyncResult> | null = null;

export function isSyncInFlight(): boolean {
  return inFlight !== null;
}

export function syncNow(settings?: SyncSettings): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = runSync(settings).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function isLocalConfigError(e: unknown): boolean {
  return e instanceof SyncConfigError;
}

function isRetryable(e: unknown): boolean {
  if (e instanceof SyncHttpError) return e.retryable;
  if (e instanceof SyncConfigError) return false;
  // TypeError = fetch gagal (offline/DNS/CORS); timeout sudah jadi Error biasa.
  return true;
}

async function runSync(settings?: SyncSettings): Promise<SyncResult> {
  const s = settings ?? loadSyncSettings();
  const events = await readPendingOutbox();
  if (events.length === 0) {
    const meta = loadSyncMeta();
    saveSyncMeta({ ...meta, lastSyncAt: new Date().toISOString(), lastError: null, lastPushed: 0 });
    return {
      pushed: 0,
      acked: [],
      rejected: [],
      failed: [],
      pending: await countPendingOutbox(),
      duplicate: false,
    };
  }

  const localByEventId = new Map(events.map((e) => [e.eventId, e.id] as const));
  const allLocalIds = events.map((e) => e.id);

  let resp: PushResponse;
  try {
    resp = await pushEvents(s.endpoint, s.apiKey, s.deviceId, events);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync gagal.";
    // Guard konfigurasi lokal bukan salah event: jangan ubah status outbox.
    if (isLocalConfigError(e)) {
      saveSyncMeta({ lastSyncAt: loadSyncMeta().lastSyncAt, lastError: msg, lastPushed: 0 });
      throw e instanceof Error ? e : new Error(msg);
    }
    if (isRetryable(e)) {
      await markRetry(allLocalIds, msg).catch(() => undefined);
    } else {
      await markFailed(allLocalIds, msg).catch(() => undefined);
    }
    saveSyncMeta({ lastSyncAt: loadSyncMeta().lastSyncAt, lastError: msg, lastPushed: 0 });
    throw e instanceof Error ? e : new Error(msg);
  }

  // Server boleh membalas `duplicate: true` tanpa daftar ack -> anggap semua ack.
  const ackIds =
    resp.duplicate && resp.acknowledged_event_ids.length === 0
      ? events.map((e) => e.eventId)
      : resp.acknowledged_event_ids;
  const acked = ackIds
    .map((id) => localByEventId.get(id))
    .filter((id): id is string => typeof id === "string");
  await markAcked(acked).catch(() => undefined);

  const rejectedLocal: string[] = [];
  for (const r of resp.rejected) {
    const localId = localByEventId.get(r.event_id);
    if (!localId) continue;
    rejectedLocal.push(localId);
    // Ditolak eksplisit oleh server: payload sama tidak akan pernah diterima.
    await markFailed([localId], `${r.code}: ${r.message}`.slice(0, 500)).catch(() => undefined);
  }

  const ackedSet = new Set(acked);
  const rejectedSet = new Set(rejectedLocal);
  const unacked = allLocalIds.filter((id) => !ackedSet.has(id) && !rejectedSet.has(id));
  if (unacked.length > 0) {
    await markRetry(unacked, "Tidak di-ack server, coba lagi.").catch(() => undefined);
  }

  saveSyncMeta({
    lastSyncAt: new Date().toISOString(),
    lastError: null,
    lastPushed: acked.length,
  });
  return {
    pushed: events.length,
    acked,
    rejected: resp.rejected,
    failed: rejectedLocal,
    pending: await countPendingOutbox(),
    duplicate: resp.duplicate,
  };
}
