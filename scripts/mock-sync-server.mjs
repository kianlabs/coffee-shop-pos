/**
 * Mock server sync (dev-only): tiru POST /v1/sync/events sesuai api/openapi.yaml.
 *
 * Jalankan:
 *   node scripts/mock-sync-server.mjs --port 8787
 *   MOCK_TOKEN=rahasia node scripts/mock-sync-server.mjs --port 8787
 *   MOCK_TOKEN=none node scripts/mock-sync-server.mjs --port 8787   # tanpa auth
 *
 * Auth: header `Authorization: Bearer <MOCK_TOKEN>` (default "dev-token").
 * Idempotensi: event_id yang sudah pernah diterima dibalas 200 + duplicate:true,
 * TIDAK menambah baris baru. State hanya di memori (hilang saat restart).
 * Aturan uji: event dengan payload.__reject=true masuk `rejected`.
 *
 * Endpoint:
 *   GET  /health              -> status ringkas (tanpa auth)
 *   GET  /events?since=<ISO>  -> inspeksi event tersimpan (butuh auth)
 *   POST /v1/sync/events      -> kirim batch event (butuh auth)
 */
import { createServer } from "node:http";

const portArg = process.argv.find((a) => a.startsWith("--port="));
const flagIdx = process.argv.indexOf("--port");
const port =
  Number(portArg ? portArg.split("=")[1] : flagIdx >= 0 ? process.argv[flagIdx + 1] : 8787) ||
  8787;

const MOCK_TOKEN = process.env.MOCK_TOKEN ?? "dev-token";
const AUTH_DISABLED = MOCK_TOKEN === "none";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** event_id -> record. Map = kunci idempotensi (tidak ada baris ganda). */
const events = new Map();
let seq = 0;

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function fail(res, code, errorCode, message, details) {
  send(res, code, { code: errorCode, message, ...(details ? { details } : {}) });
}

function authorized(req) {
  if (AUTH_DISABLED) return true;
  const header = req.headers.authorization ?? "";
  return header === `Bearer ${MOCK_TOKEN}`;
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        tooLarge = true;
        resolve({ tooLarge: true, body: "" });
      }
    });
    req.on("end", () => {
      if (!tooLarge) resolve({ tooLarge: false, body });
    });
    req.on("error", () => resolve({ tooLarge: false, body: "" }));
  });
}

/** Validasi field wajib; kembalikan daftar error (kosong = valid). */
function validateEvent(e, index) {
  const errors = [];
  const required = ["event_id", "event_type", "aggregate_id"];
  if (typeof e !== "object" || e === null) {
    return [{ index, field: "event", message: "Event harus object." }];
  }
  for (const field of required) {
    if (typeof e[field] !== "string" || e[field].trim() === "") {
      errors.push({ index, field, message: `${field} wajib diisi.` });
    }
  }
  if (typeof e.event_id === "string" && e.event_id && !UUID_RE.test(e.event_id)) {
    errors.push({ index, field: "event_id", message: "event_id harus UUID (format: uuid)." });
  }
  if (e.payload !== undefined && (typeof e.payload !== "object" || e.payload === null)) {
    errors.push({ index, field: "payload", message: "payload harus object." });
  }
  return errors;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  // --- Health (tanpa auth) ---
  if (req.method === "GET" && (path === "/health" || path === "/v1/health")) {
    return send(res, 200, {
      ok: true,
      mock: true,
      auth: AUTH_DISABLED ? "off" : "on",
      events: events.size,
    });
  }

  // --- Inspeksi event (butuh auth) ---
  if (req.method === "GET" && (path === "/events" || path === "/v1/events")) {
    if (!authorized(req)) {
      return fail(res, 401, "UNAUTHORIZED", "Authorization: Bearer <token> wajib.");
    }
    const since = url.searchParams.get("since");
    let sinceMs = 0;
    if (since) {
      const parsed = Date.parse(since);
      if (Number.isNaN(parsed)) {
        return fail(res, 400, "BAD_SINCE", "since harus ISO date-time.");
      }
      sinceMs = parsed;
    }
    const list = [...events.values()]
      .filter((e) => Date.parse(e.received_at) > sinceMs)
      .sort((a, b) => a.seq - b.seq);
    return send(res, 200, { count: list.length, total: events.size, events: list });
  }

  // --- Push event ---
  if (path !== "/v1/sync/events") {
    return fail(res, 404, "NOT_FOUND", "Not found (mock).");
  }
  if (req.method !== "POST") {
    return fail(res, 405, "METHOD_NOT_ALLOWED", "Gunakan POST.");
  }
  if (!authorized(req)) {
    return fail(res, 401, "UNAUTHORIZED", "Authorization: Bearer <token> wajib.");
  }

  const { tooLarge, body } = await readBody(req);
  if (tooLarge) {
    return fail(res, 413, "BODY_TOO_LARGE", "Body melebihi 2 MB.");
  }
  let parsed;
  try {
    parsed = JSON.parse(body || "{}");
  } catch {
    return fail(res, 400, "BAD_JSON", "Body bukan JSON.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    return fail(res, 400, "BAD_BODY", "Body harus object JSON.");
  }
  if (typeof parsed.device_id !== "string" || parsed.device_id.trim() === "") {
    return fail(res, 400, "MISSING_DEVICE_ID", "device_id wajib diisi.");
  }
  if (!Array.isArray(parsed.events) || parsed.events.length === 0) {
    return fail(res, 400, "MISSING_EVENTS", "events[] wajib berisi minimal 1 event.");
  }

  const validationErrors = [];
  parsed.events.forEach((e, i) => validationErrors.push(...validateEvent(e, i)));
  if (validationErrors.length > 0) {
    return fail(res, 400, "VALIDATION_ERROR", "Payload event tidak valid.", validationErrors);
  }

  const acked = [];
  const duplicates = [];
  const rejected = [];
  const nowIso = new Date().toISOString();

  for (const e of parsed.events) {
    if (e.payload && typeof e.payload === "object" && e.payload.__reject === true) {
      rejected.push({ event_id: e.event_id, code: "MOCK_REJECT", message: "Ditolak mock (payload.__reject)." });
      continue;
    }
    if (events.has(e.event_id)) {
      duplicates.push(e.event_id);
      acked.push(e.event_id);
      continue;
    }
    seq += 1;
    events.set(e.event_id, {
      seq,
      event_id: e.event_id,
      event_type: e.event_type,
      aggregate_type: typeof e.aggregate_type === "string" ? e.aggregate_type : "",
      aggregate_id: e.aggregate_id,
      schema_version: Number.isInteger(e.schema_version) ? e.schema_version : 1,
      occurred_at: typeof e.occurred_at === "string" ? e.occurred_at : nowIso,
      payload: e.payload && typeof e.payload === "object" ? e.payload : {},
      device_id: parsed.device_id,
      received_at: nowIso,
    });
    acked.push(e.event_id);
  }

  return send(res, 200, {
    acknowledged_event_ids: acked,
    rejected,
    duplicates,
    // true hanya bila SEMUA event pada batch ini sudah pernah diterima.
    duplicate: acked.length > 0 && duplicates.length === acked.length,
  });
});

server.listen(port, () => {
  console.log(
    `mock-sync listening on http://localhost:${port} (auth=${AUTH_DISABLED ? "off" : "bearer"}, events=${events.size})`,
  );
});
