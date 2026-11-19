// Penjaga Registry_Pengaturan (Req 28.13):
//   (a) setiap definisi punya default, label id/en, dan bantuan id/en
//   (b) pemanggilan settings.get/use/set (dan setMany/reset) dengan literal kunci yang tidak terdaftar
//   (c) kunci duplikat
//   (d) default berada dalam rentang atau opsi
// Registry dibaca dengan mentranspilasi src/domain/settings memakai TypeScript Compiler API.
// Pemakaian: node scripts/check-settings.mjs [folder-repo]
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const SETTINGS_DIR = "src/domain/settings";
const KEY_METHODS = new Set(["get", "use", "set"]);

/** (a) dan (d): masalah per definisi. */
export function definitionProblems(settings, validateValue) {
  const problems = [];
  const text = (v) => typeof v === "string" && v.trim().length > 0;
  for (const def of settings) {
    const key = def.key ?? "(tanpa kunci)";
    if (def.default === undefined) problems.push({ key, problem: "tidak punya nilai default" });
    for (const field of ["label", "help"]) {
      for (const lang of ["id", "en"]) {
        if (!text(def[field]?.[lang])) problems.push({ key, problem: `tidak punya ${field}.${lang}` });
      }
    }
    if (def.default !== undefined) {
      const error = validateValue(def, def.default);
      if (error) problems.push({ key, problem: `default di luar rentang/opsi: ${error}` });
    }
  }
  return problems;
}

/** (c): kunci yang muncul lebih dari sekali. */
export function duplicateKeys(settings) {
  const seen = new Set();
  const dupes = new Set();
  for (const { key } of settings) (seen.has(key) ? dupes : seen).add(key);
  return [...dupes];
}

function isSettingsReceiver(expr) {
  if (ts.isIdentifier(expr)) return expr.text === "settings";
  return ts.isPropertyAccessExpression(expr) && expr.name.text === "settings";
}

function literalText(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}

/** Literal keys used by one call: get/use/set("k"), setMany({ "k": v }), reset(["k"]). */
function literalKeys(method, args) {
  const [first] = args;
  if (KEY_METHODS.has(method)) return literalText(first) === null ? [] : [{ key: literalText(first), node: first }];
  if (method === "setMany" && first && ts.isObjectLiteralExpression(first)) {
    return first.properties.filter((p) => p.name && literalText(p.name) !== null).map((p) => ({ key: literalText(p.name), node: p }));
  }
  if (method === "reset" && first && ts.isArrayLiteralExpression(first)) {
    return first.elements.filter((e) => literalText(e) !== null).map((e) => ({ key: literalText(e), node: e }));
  }
  return [];
}

/** (b): pemanggilan dengan kunci literal yang tidak terdaftar. `files` = Map<relPath, text>. */
export function unregisteredCalls(files, keys) {
  const hits = [];
  for (const [rel, text] of files) {
    const kind = rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.ES2022, true, kind);
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && isSettingsReceiver(node.expression.expression)) {
        const method = node.expression.name.text;
        for (const { key, node: at } of literalKeys(method, node.arguments)) {
          if (keys.has(key)) continue;
          const line = sf.getLineAndCharacterOfPosition(at.getStart(sf)).line + 1;
          hits.push({ file: rel, line, method, key });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return hits;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** Rewrites relative specifiers to the emitted .mjs files. */
function rewriteSpecifiers(code, fromFile) {
  return code.replace(/(from\s*|import\s*\(\s*)(["'])(\.{1,2}\/[^"']+)\2/g, (match, lead, quote, spec) => {
    const base = path.resolve(path.dirname(fromFile), spec);
    if (existsSync(`${base}.ts`)) return `${lead}${quote}${spec}.mjs${quote}`;
    if (existsSync(path.join(base, "index.ts"))) return `${lead}${quote}${spec}/index.mjs${quote}`;
    return match;
  });
}

/** Transpiles src/domain/settings to a temp folder and imports the registry and validator. */
export async function loadRegistry(root) {
  const src = path.join(root, SETTINGS_DIR);
  const out = mkdtempSync(path.join(tmpdir(), "check-settings-"));
  try {
    for (const file of walk(src)) {
      const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      });
      const target = path.join(out, path.relative(src, file)).replace(/\.tsx?$/, ".mjs");
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, rewriteSpecifiers(outputText, file));
    }
    const defs = await import(pathToFileURL(path.join(out, "definitions/index.mjs")).href);
    const validate = await import(pathToFileURL(path.join(out, "validate.mjs")).href);
    return { settings: [...defs.SETTINGS], validateValue: validate.validateValue };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

async function main() {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const { settings, validateValue } = await loadRegistry(root);
  const files = new Map(walk(path.join(root, "src")).map((f) => [path.relative(root, f).split(path.sep).join("/"), readFileSync(f, "utf8")]));
  const problems = definitionProblems(settings, validateValue);
  const dupes = duplicateKeys(settings);
  const calls = unregisteredCalls(files, new Set(settings.map((s) => s.key)));
  for (const p of problems) console.error(`registry: "${p.key}" ${p.problem}`);
  for (const key of dupes) console.error(`registry: kunci "${key}" terdaftar lebih dari sekali`);
  for (const c of calls) console.error(`${c.file}:${c.line}: settings.${c.method} memakai kunci tidak terdaftar "${c.key}"`);
  const total = problems.length + dupes.length + calls.length;
  if (total > 0) {
    console.error(`\ncheck-settings gagal: ${total} masalah.`);
    process.exit(1);
  }
  console.log(`check-settings lulus: ${settings.length} kunci, ${files.size} berkas dipindai.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(`check-settings gagal: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
