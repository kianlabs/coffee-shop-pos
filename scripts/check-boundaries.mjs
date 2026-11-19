// Penegak arsitektur: batas impor antarlapisan, batas baris .tsx, dan jalur tulis SQLite.
// Memakai TypeScript Compiler API. Pemakaian:
//   node scripts/check-boundaries.mjs [folder-repo]
// Pelanggaran yang sudah ada dicatat di scripts/boundaries-allowlist.json dan
// wajib dihapus dari daftar begitu diperbaiki (entri basi juga membuat gagal).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export const MAX_TSX_LINES = 600;
const SQLITE_PKG = "@capacitor-community/sqlite";
const FRAMEWORK = /^(react|react-dom)(\/|$)/;
const CAPACITOR = /^@capacitor(\/|-community\/)/;
const WRITE_METHODS = new Set(["run", "execute", "beginTransaction"]);
const TX_ALLOWED = ["src/data/tx.ts", "src/data/migration/"];

/** Lapisan dari path relatif terhadap akar repo (tanpa ekstensi). */
export function layerOf(rel) {
  if (rel.startsWith("src/domain/")) return "domain";
  if (rel.startsWith("src/services/")) return "services";
  if (rel.startsWith("src/data/")) return "data";
  if (/^src\/(features|components|app|stores|lib)\//.test(rel)) return "ui";
  if (rel.startsWith("src/testing/") || rel.startsWith("src/modules/")) return "other";
  return "root";
}

/** Menentukan lapisan target dari spesifier impor, atau "external:<paket>". */
export function targetOf(fromRel, spec) {
  if (spec.startsWith("@/")) return { layer: layerOf(`src/${spec.slice(2)}`), rel: `src/${spec.slice(2)}` };
  if (spec.startsWith(".")) {
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
    return { layer: layerOf(rel), rel };
  }
  return { layer: "external", pkg: spec };
}

/** Aturan impor: mengembalikan id aturan yang dilanggar, atau null. */
export function importRule(fromLayer, target) {
  if (target.layer === "external") return externalRule(fromLayer, target.pkg);
  if (fromLayer === "domain" && ["data", "services", "ui", "other"].includes(target.layer)) return "domain-no-outer-layer";
  if (fromLayer === "services" && ["data", "ui"].includes(target.layer)) return "services-no-data-or-ui";
  if (fromLayer === "data" && target.layer === "ui") return "data-no-ui";
  if (fromLayer === "ui" && target.layer === "data") return "ui-no-data";
  return null;
}

function externalRule(fromLayer, pkg) {
  if (pkg === SQLITE_PKG && fromLayer !== "data") return "no-sqlite-outside-data";
  if (fromLayer === "domain" && (FRAMEWORK.test(pkg) || CAPACITOR.test(pkg) || pkg === SQLITE_PKG)) {
    return "domain-no-framework-or-plugin";
  }
  if (fromLayer === "services" && (FRAMEWORK.test(pkg) || CAPACITOR.test(pkg))) return "services-no-framework";
  if (fromLayer === "data" && FRAMEWORK.test(pkg)) return "data-no-react";
  return null;
}

function moduleSpecifiers(sf) {
  const out = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) out.push({ spec: node.moduleSpecifier.text, node });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) out.push({ spec: arg.text, node });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function calleeName(call) {
  const expr = call.expression;
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return null;
}

function insideSerializedWrite(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && calleeName(p) === "runSerializedWrite") return true;
  }
  return false;
}

function domainImpurity(sf) {
  const hits = [];
  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const pair = `${node.expression.text}.${node.name.text}`;
      if (pair === "Math.random" || pair === "Date.now") hits.push({ node, rule: "domain-impure-api", detail: pair });
    }
    if (ts.isIdentifier(node) && node.text === "localStorage") {
      hits.push({ node, rule: "domain-impure-api", detail: "localStorage" });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

function writePathHits(sf, rel) {
  const hits = [];
  const allowed = TX_ALLOWED.some((p) => (p.endsWith("/") ? rel.startsWith(p) : rel === p));
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      if (!allowed && ts.isPropertyAccessExpression(node.expression) && WRITE_METHODS.has(name)) {
        hits.push({ rule: "write-path-outside-tx", detail: name });
      }
      if (name === "withTransaction" && !insideSerializedWrite(node)) {
        hits.push({ rule: "tx-outside-serialized-write", detail: "withTransaction" });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

/**
 * Memeriksa kumpulan berkas. `files` berupa Map<relPath, sourceText>.
 * Mengembalikan daftar { file, rule, detail, line }.
 */
export function findViolations(files) {
  const violations = [];
  const add = (file, rule, detail, line = 1) => violations.push({ file, rule, detail, line });
  for (const [rel, text] of files) {
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.ES2022, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const fromLayer = layerOf(rel);
    const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    for (const { spec, node } of moduleSpecifiers(sf)) {
      const target = targetOf(rel, spec);
      const rule = importRule(fromLayer, target);
      if (rule) add(rel, rule, spec, lineOf(node));
    }
    if (fromLayer === "domain") {
      for (const hit of domainImpurity(sf)) add(rel, hit.rule, hit.detail, lineOf(hit.node));
    }
    if (fromLayer !== "other") {
      for (const hit of writePathHits(sf, rel)) add(rel, hit.rule, hit.detail, 1);
    }
    if (rel.endsWith(".tsx")) {
      const lines = text.split("\n").length;
      if (lines > MAX_TSX_LINES) add(rel, "max-tsx-lines", `${lines} baris (maks ${MAX_TSX_LINES})`);
    }
  }
  return violations;
}

function listSources(root) {
  const out = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) {
        const rel = path.relative(root, full).split(path.sep).join("/");
        out.set(rel, readFileSync(full, "utf8"));
      }
    }
  };
  walk(path.join(root, "src"));
  return out;
}

function main() {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const allowFile = path.join(import.meta.dirname, "boundaries-allowlist.json");
  const allowlist = JSON.parse(readFileSync(allowFile, "utf8"));
  const key = (v) => `${v.file}|${v.rule}`;
  const allowed = new Set(allowlist.map((e) => `${e.file}|${e.rule}`));

  const found = findViolations(listSources(root));
  const foundKeys = new Set(found.map(key));
  const blocking = found.filter((v) => !allowed.has(key(v)));
  const stale = [...allowed].filter((k) => !foundKeys.has(k));

  for (const v of blocking) {
    console.error(`${v.file}:${v.line}: [${v.rule}] ${v.detail}`);
  }
  for (const k of stale) {
    console.error(`boundaries-allowlist.json: entri basi, hapus: ${k}`);
  }
  const suppressed = found.length - blocking.length;
  if (blocking.length > 0 || stale.length > 0) {
    console.error(`\ncheck-boundaries gagal: ${blocking.length} pelanggaran baru, ${stale.length} entri basi (${suppressed} dicatat di allowlist).`);
    process.exit(1);
  }
  console.log(`check-boundaries lulus: ${suppressed} pelanggaran tercatat di allowlist, tidak ada yang baru.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
