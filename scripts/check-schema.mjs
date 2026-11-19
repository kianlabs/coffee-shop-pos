// Pemeriksa skema (Req 18.6): jalankan semua UPGRADE_Vn dari src/data/migrations.ts
// pada sql.js kosong, lalu bandingkan dengan hasil database/sqlite-schema.sql.
// Pemakaian: node scripts/check-schema.mjs [folder-repo]
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import initSqlJs from "sql.js";
import ts from "typescript";
const IGNORED_TABLES = new Set(["schema_migrations"]);
/** Memuat UPGRADE_V1..Vn dari file TypeScript migrasi, berurutan. */
export async function loadMigrations(file) {
  const source = readFileSync(file, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
  const steps = Object.keys(mod)
    .map((key) => /^UPGRADE_V(\d+)$/.exec(key))
    .filter((m) => m !== null)
    .map((m) => ({ version: Number(m[1]), statements: mod[m[0]] }))
    .sort((a, b) => a.version - b.version);
  steps.forEach((s, i) => {
    if (s.version !== i + 1) throw new Error(`Rantai migrasi terputus: UPGRADE_V${i + 1} tidak ada.`);
  });
  return steps.map((s) => s.statements);
}
/** Buang komentar (di luar literal string), rapikan spasi dan spasi di sekitar tanda baca. */
export function normalizeSql(sql) {
  if (sql === null || sql === undefined) return null;
  const squash = (s) => s.replace(/\s+/g, " ").replace(/\s*([(),;])\s*/g, "$1");
  let out = "";
  let code = "";
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      const end = sql.indexOf(ch, i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      out += squash(code) + sql.slice(i, stop);
      code = "";
      i = stop - 1;
    } else if (ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl - 1;
      code += " ";
    } else if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 1;
      code += " ";
    } else code += ch;
  }
  return (out + squash(code)).trim().replace(/;+$/, "");
}
function all(db, sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}
function indexInfo(db, idx) {
  const columns = all(db, "SELECT name FROM pragma_index_info(?) ORDER BY seqno", [idx.name]).map((c) => c.name ?? "<ekspresi>");
  const sql = all(db, "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?", [idx.name])[0]?.sql;
  return { unique: idx.unique, origin: idx.origin, partial: idx.partial, columns: columns.join(","), sql: normalizeSql(sql) };
}
function tableInfo(db, name, sql) {
  const columns = all(db, "SELECT name, type, \"notnull\", dflt_value, pk FROM pragma_table_info(?) ORDER BY cid", [name]);
  const indexes = {};
  for (const idx of all(db, "SELECT name, \"unique\", origin, partial FROM pragma_index_list(?)", [name])) {
    indexes[idx.name] = indexInfo(db, idx);
  }
  const foreignKeys = {};
  for (const fk of all(db, "SELECT * FROM pragma_foreign_key_list(?)", [name])) {
    foreignKeys[`${fk.from} -> ${fk.table}(${fk.to ?? ""})`] = { on_update: fk.on_update, on_delete: fk.on_delete, match: fk.match };
  }
  return { sql: normalizeSql(sql), columns, indexes, foreignKeys };
}
/** Struktur skema dari database sql.js yang sudah terbuka. */
export function describeSchema(db) {
  const tables = {};
  const others = {};
  for (const obj of all(db, "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name")) {
    if (obj.type === "table" && !IGNORED_TABLES.has(obj.name)) tables[obj.name] = tableInfo(db, obj.name, obj.sql);
    if (obj.type === "trigger" || obj.type === "view") others[`${obj.type} ${obj.name}`] = normalizeSql(obj.sql);
  }
  return { tables, others };
}
const fmt = (v) => (v === null || v === undefined ? "(tidak ada)" : JSON.stringify(v));
function diffKeys(label, migrated, reference, compare, out) {
  for (const key of [...new Set([...Object.keys(migrated), ...Object.keys(reference)])].sort()) {
    if (!(key in reference)) out.push(`${label} ${key}: hanya ada di migrasi`);
    else if (!(key in migrated)) out.push(`${label} ${key}: hanya ada di referensi`);
    else compare(key, migrated[key], reference[key]);
  }
}
function diffFields(label, a, b, out) {
  for (const field of Object.keys({ ...a, ...b })) {
    if (a[field] !== b[field]) out.push(`${label}: ${field} migrasi=${fmt(a[field])} referensi=${fmt(b[field])}`);
  }
}
function diffTable(name, m, r, out) {
  const t = `tabel ${name}`;
  const byName = (cols) => Object.fromEntries(cols.map((c) => [c.name, c]));
  diffKeys(`${t}, kolom`, byName(m.columns), byName(r.columns), (c, a, b) => diffFields(`${t}, kolom ${c}`, a, b, out), out);
  const order = (cols) => cols.map((c) => c.name).join(",");
  if (order(m.columns) !== order(r.columns)) out.push(`${t}: urutan kolom migrasi=${order(m.columns)} referensi=${order(r.columns)}`);
  diffKeys(`${t}, indeks`, m.indexes, r.indexes, (i, a, b) => diffFields(`${t}, indeks ${i}`, a, b, out), out);
  diffKeys(`${t}, FK`, m.foreignKeys, r.foreignKeys, (k, a, b) => diffFields(`${t}, FK ${k}`, a, b, out), out);
  if (m.sql !== r.sql) out.push(`${t}: SQL CREATE berbeda\n    migrasi:   ${m.sql}\n    referensi: ${r.sql}`);
}
/** Daftar selisih; kosong berarti skema sama. */
export function diffSchemas(migrated, reference) {
  const out = [];
  diffKeys("tabel", migrated.tables, reference.tables, (name, m, r) => diffTable(name, m, r, out), out);
  diffKeys("objek", migrated.others, reference.others, (name, m, r) => {
    if (m !== r) out.push(`objek ${name}: SQL berbeda\n    migrasi:   ${m}\n    referensi: ${r}`);
  }, out);
  return out;
}
async function schemaOf(SQL, run) {
  const db = new SQL.Database();
  try {
    run(db);
    return describeSchema(db);
  } finally {
    db.close();
  }
}
/** Bandingkan hasil migrasi dengan SQL referensi; mengembalikan daftar selisih. */
export async function checkSchema({ migrations, referenceSql }) {
  const SQL = await initSqlJs();
  const migrated = await schemaOf(SQL, (db) => migrations.forEach((batch) => batch.forEach((s) => db.exec(s))));
  const reference = await schemaOf(SQL, (db) => db.exec(referenceSql));
  return diffSchemas(migrated, reference);
}
async function main() {
  const root = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, ".."));
  const migrations = await loadMigrations(path.join(root, "src/data/migrations.ts"));
  const referenceSql = readFileSync(path.join(root, "database/sqlite-schema.sql"), "utf8");
  const diffs = await checkSchema({ migrations, referenceSql });
  if (diffs.length > 0) {
    console.error(`check-schema gagal: ${diffs.length} selisih antara migrasi V1..V${migrations.length} dan database/sqlite-schema.sql`);
    for (const d of diffs) console.error(`  - ${d}`);
    process.exit(1);
  }
  console.log(`check-schema lulus: migrasi V1..V${migrations.length} sama dengan database/sqlite-schema.sql.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(`check-schema error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
