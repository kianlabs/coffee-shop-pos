/**
 * Mock server sync (dev-only): tiru POST /v1/sync/events sesuai api/openapi.yaml.
 * Jalankan: `node scripts/mock-sync-server.mjs --port 8787`
 * Lalu isi Endpoint di panel Sync: http://localhost:8787 + API key bebas.
 * Aturan: event dengan payload.__reject=true masuk `rejected`,
 * sisanya masuk `acknowledged_event_ids` (idempoten per event_id).
 */
import { createServer } from "node:http";

const portArg = process.argv.find((a) => a.startsWith("--port="));
const flagIdx = process.argv.indexOf("--port");
const port = Number(
  portArg ? portArg.split("=")[1] : flagIdx >= 0 ? process.argv[flagIdx + 1] : 8787,
) || 8787;

const seen = new Set();

const server = createServer((req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.method === "GET" && req.url === "/v1/health") {
    return send(200, { ok: true, mock: true });
  }
  if (req.method !== "POST" || (req.url ?? "").split("?")[0] !== "/v1/sync/events") {
    return send(404, { message: "Not found (mock)." });
  }
  let body = "";
  req.on("data", (c) => {
    body += c;
    if (body.length > 2 * 1024 * 1024) req.destroy();
  });
  req.on("end", () => {
    let parsed = null;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      return send(400, { message: "Body bukan JSON." });
    }
    const events = Array.isArray(parsed.events) ? parsed.events : null;
    if (typeof parsed.device_id !== "string" || !events) {
      return send(400, { message: "Wajib device_id + events[]." });
    }
    const acked = [];
    const rejected = [];
    for (const e of events) {
      const id = typeof e?.event_id === "string" ? e.event_id : "";
      if (!id) {
        rejected.push({ event_id: "", code: "BAD_ID", message: "event_id wajib string." });
        continue;
      }
      if (e?.payload && typeof e.payload === "object" && e.payload.__reject === true) {
        rejected.push({ event_id: id, code: "MOCK_REJECT", message: "Ditolak mock (payload.__reject)." });
        continue;
      }
      seen.add(id);
      acked.push(id);
    }
    return send(200, { acknowledged_event_ids: acked, rejected });
  });
});

server.listen(port, () => {
  console.log(`mock-sync listening on http://localhost:${port} (events=${seen.size})`);
});
