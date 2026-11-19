// Validates api/openapi.yaml against the sync client (src/data/sync.ts, src/data/orderRepository.ts)
// and checks every example payload in `x-sync-events` against its schema.
// No YAML package: uses scripts/lib/mini-yaml.mjs (indent-based subset) and a small schema validator.
// Usage: node scripts/check-openapi.mjs [repo-folder]
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseYaml } from "./lib/mini-yaml.mjs";
import { validate } from "./lib/mini-schema.mjs";

const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

function resolveRef(spec, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return undefined;
  return ref.slice(2).split("/").reduce((n, k) => (isObj(n) ? n[k] : undefined), spec);
}

/** Keys of the request body built in sync.ts: top level and per-event. */
export function extractSyncBodyKeys(syncSource) {
  const top = /body:\s*JSON\.stringify\(\{([\s\S]*?)events:\s*events\.map\(\(e\)\s*=>\s*\(\{([\s\S]*?)\}\)\)/.exec(syncSource);
  if (!top) return null;
  const keys = (text) => [...text.matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]);
  return { request: [...keys(top[1]), "events"], event: keys(top[2]) };
}

/** event_type values inserted into sync_outbox by the data layer. */
export function extractEmittedEventTypes(source) {
  const types = new Set();
  for (const m of source.matchAll(/INSERT INTO sync_outbox[^"`]*?VALUES\s*\(\?,\s*'([^']+)'/g)) types.add(m[1]);
  return [...types].sort();
}

/** Returns failures as { event, message } (event is "-" for non-event problems). */
export function checkOpenApi(specText, ctx = {}) {
  const fails = [];
  const fail = (event, message) => fails.push({ event, message });
  let spec;
  try {
    spec = parseYaml(specText);
  } catch (e) {
    return [{ event: "-", message: `YAML tidak dapat dibaca: ${e.message}` }];
  }
  if (!isObj(spec) || typeof spec.openapi !== "string" || !spec.openapi.startsWith("3.")) {
    fail("-", "field `openapi` (3.x) tidak ada");
  }
  const events = isObj(spec) ? spec["x-sync-events"] : undefined;
  if (!isObj(events) || Object.keys(events).length === 0) {
    fail("-", "`x-sync-events` kosong atau tidak ada");
    return fails;
  }
  for (const [name, def] of Object.entries(events)) {
    const schema = isObj(def) ? resolveRef(spec, def.payload) : undefined;
    if (!schema) {
      fail(name, `skema payload tidak ditemukan (${isObj(def) ? def.payload : "definisi bukan objek"})`);
      continue;
    }
    if (!isObj(def.example)) {
      fail(name, "payload contoh tidak ada");
      continue;
    }
    for (const err of validate(def.example, schema, spec)) fail(name, err);
  }
  const eventSchema = spec.components?.schemas?.SyncEvent;
  const requestSchema = spec.components?.schemas?.SyncRequest;
  if (ctx.syncSource !== undefined) {
    const keys = extractSyncBodyKeys(ctx.syncSource);
    if (!keys) fail("-", "badan request tidak ditemukan di src/data/sync.ts");
    else {
      for (const k of keys.request) if (!requestSchema?.properties?.[k]) fail("-", `SyncRequest tidak punya field "${k}" yang dikirim client`);
      for (const k of keys.event) if (!eventSchema?.properties?.[k]) fail("-", `SyncEvent tidak punya field "${k}" yang dikirim client`);
    }
  }
  if (ctx.emittedEventTypes) {
    for (const t of ctx.emittedEventTypes) if (!(t in events)) fail(t, "dikirim client tetapi tidak didefinisikan di x-sync-events");
  }
  return fails;
}

function main() {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const read = (rel) => (existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), "utf8") : undefined);
  const specText = read("api/openapi.yaml");
  if (specText === undefined) {
    console.error("api/openapi.yaml tidak ada");
    process.exit(1);
  }
  const ctx = { syncSource: read("src/data/sync.ts") };
  const repo = read("src/data/orderRepository.ts");
  if (repo !== undefined) ctx.emittedEventTypes = extractEmittedEventTypes(repo);
  const fails = checkOpenApi(specText, ctx);
  for (const f of fails) console.error(`api/openapi.yaml: event ${f.event}: ${f.message}`);
  if (fails.length > 0) {
    console.error(`\ncheck-openapi gagal: ${fails.length} masalah.`);
    process.exit(1);
  }
  const n = Object.keys(parseYaml(specText)["x-sync-events"]).length;
  console.log(`check-openapi lulus: ${n} jenis event dengan payload contoh valid.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
