// Mengukur ukuran gzip JS dan CSS awal dari dist/ (setelah `npm run build`) dan
// gagal bila melebihi scripts/bundle-budget.json. JS awal = skrip entri,
// modulepreload, dan impor statis transitifnya; chunk lazy tidak dihitung.
// Pemakaian: npm run check:bundle (= node scripts/check-bundle-size.mjs --require-dist), setelah build.
// Tanpa --require-dist (mis. dipanggil run-checks.mjs) skrip ini selalu dilewati, karena dist/ bisa
// tidak ada atau basi; anggaran dicek di CI sesudah langkah build.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
const STATIC_IMPORT = /(?:\bfrom|\bimport)\s*["']\.\/([^"']+\.js)["']/g;
const attr = (tag, name) => new RegExp(`${name}=["']([^"']+)["']`).exec(tag)?.[1];
/** Returns { js: string[], css: string[] } paths relative to dist/, from index.html and static imports. */
export function initialAssets(indexHtml, readText) {
  const js = new Set();
  const css = new Set();
  for (const tag of indexHtml.match(/<(?:script|link)\b[^>]*>/g) ?? []) {
    const href = attr(tag, "src") ?? attr(tag, "href");
    if (!href || /^https?:/.test(href)) continue;
    const rel = href.replace(/^\//, "");
    if (/<script/.test(tag) && /type=["']module["']/.test(tag)) js.add(rel);
    else if (/rel=["']modulepreload["']/.test(tag)) js.add(rel);
    else if (/rel=["']stylesheet["']/.test(tag)) css.add(rel);
  }
  const queue = [...js];
  while (queue.length > 0) {
    const file = queue.pop();
    const dir = path.posix.dirname(file);
    const text = readText(file);
    for (const m of text.matchAll(STATIC_IMPORT)) {
      const dep = path.posix.join(dir, m[1]);
      if (!js.has(dep)) {
        js.add(dep);
        queue.push(dep);
      }
    }
  }
  return { js: [...js].sort(), css: [...css].sort() };
}
const gzipKb = (buf) => gzipSync(buf).length / 1024;
export function measure(indexHtml, readBuf) {
  const { js, css } = initialAssets(indexHtml, (f) => readBuf(f).toString("utf8"));
  const sum = (files) => files.reduce((acc, f) => acc + gzipKb(readBuf(f)), 0);
  return { jsKb: sum(js), cssKb: sum(css), jsFiles: js, cssFiles: css };
}
/** Returns a list of violation messages (empty = within budget). */
export function checkBudget(result, budget) {
  const errors = [];
  if (result.jsFiles.length === 0) errors.push("Tidak ada JS awal ditemukan di dist/index.html.");
  if (result.jsKb > budget.initialJsGzipKb) {
    errors.push(`JS awal ${result.jsKb.toFixed(1)} KB gzip melebihi anggaran ${budget.initialJsGzipKb} KB.`);
  }
  if (result.cssKb > budget.initialCssGzipKb) {
    errors.push(`CSS awal ${result.cssKb.toFixed(1)} KB gzip melebihi anggaran ${budget.initialCssGzipKb} KB.`);
  }
  return errors;
}
function main() {
  const args = process.argv.slice(2);
  const required = args.includes("--require-dist");
  const root = path.resolve(args.find((a) => !a.startsWith("--")) ?? process.cwd());
  const dist = path.join(root, "dist");
  if (!required) {
    console.log("check-bundle-size dilewati: jalankan `npm run check:bundle` setelah `npm run build`.");
    return;
  }
  if (!existsSync(path.join(dist, "index.html"))) {
    console.error("check-bundle-size gagal: dist/index.html tidak ada. Jalankan `npm run build` dulu.");
    process.exit(1);
  }
  const budget = JSON.parse(readFileSync(path.join(root, "scripts/bundle-budget.json"), "utf8"));
  const result = measure(readFileSync(path.join(dist, "index.html"), "utf8"), (f) => readFileSync(path.join(dist, f)));
  console.log(`JS awal: ${result.jsKb.toFixed(1)} KB gzip (anggaran ${budget.initialJsGzipKb} KB, ${result.jsFiles.length} berkas)`);
  console.log(`CSS awal: ${result.cssKb.toFixed(1)} KB gzip (anggaran ${budget.initialCssGzipKb} KB, ${result.cssFiles.length} berkas)`);
  const errors = checkBudget(result, budget);
  for (const e of errors) console.error(e);
  if (errors.length > 0) process.exit(1);
  console.log("check-bundle-size lulus.");
}
if (import.meta.url === `file://${process.argv[1]}`) main();
