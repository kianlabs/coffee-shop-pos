// Memastikan id.json dan en.json memuat kunci yang sama persis.
// Pemakaian: node scripts/check-i18n.mjs [folder-repo]
import { readFileSync } from "node:fs";
import path from "node:path";

export function missingKeys(catalogs) {
  const names = Object.keys(catalogs);
  const union = new Set(names.flatMap((n) => Object.keys(catalogs[n])));
  const report = [];
  for (const name of names) {
    for (const key of union) {
      if (!(key in catalogs[name])) report.push({ locale: name, key });
    }
  }
  return report;
}

function main() {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const dir = path.join(root, "src/locales");
  const catalogs = {};
  for (const locale of ["id", "en"]) {
    catalogs[locale] = JSON.parse(readFileSync(path.join(dir, `${locale}.json`), "utf8"));
  }
  const missing = missingKeys(catalogs);
  for (const m of missing) {
    console.error(`src/locales/${m.locale}.json: kunci "${m.key}" tidak ada`);
  }
  if (missing.length > 0) {
    console.error(`\ncheck-i18n gagal: ${missing.length} kunci kurang.`);
    process.exit(1);
  }
  const count = Object.keys(catalogs.id).length;
  console.log(`check-i18n lulus: ${count} kunci sama di id dan en.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
