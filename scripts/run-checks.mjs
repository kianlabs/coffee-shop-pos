// Menjalankan semua scripts/check-*.mjs berurutan. Gagal bila salah satu gagal.
// Pemakaian: node scripts/run-checks.mjs [folder-repo]
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const TARGET = path.resolve(process.argv[2] ?? ROOT);

const checks = readdirSync(import.meta.dirname)
  .filter((name) => /^check-.*\.mjs$/.test(name))
  .sort();

if (checks.length === 0) {
  console.error("Tidak ada scripts/check-*.mjs yang ditemukan.");
  process.exit(1);
}

const failed = [];
for (const name of checks) {
  const file = path.join(import.meta.dirname, name);
  const result = spawnSync(process.execPath, [file, TARGET], { stdio: "inherit" });
  if (result.status !== 0) {
    failed.push(name);
  }
}

if (failed.length > 0) {
  console.error(`\n${failed.length} pemeriksaan gagal: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`\nSEMUA ${checks.length} PEMERIKSAAN LULUS`);
