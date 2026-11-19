// Melarang literal warna (hex, rgb, hsl) di src/components dan src/features.
// Warna harus lewat token di src/styles/globals.css.
// Pemakaian: node scripts/check-tokens.mjs [folder-repo]
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SCANNED_DIRS = ["src/components", "src/features"];
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/;

export function findColorLiterals(files) {
  const hits = [];
  for (const [rel, text] of files) {
    text.split("\n").forEach((line, index) => {
      if (COLOR_LITERAL.test(line)) hits.push({ file: rel, line: index + 1, text: line.trim().slice(0, 120) });
    });
  }
  return hits;
}

function collect(root, dir, out) {
  const full = path.join(root, dir);
  try {
    statSync(full);
  } catch {
    return;
  }
  for (const name of readdirSync(full)) {
    const abs = path.join(full, name);
    if (statSync(abs).isDirectory()) {
      collect(root, path.join(dir, name), out);
    } else if (/\.(ts|tsx|css)$/.test(name)) {
      out.set(path.relative(root, abs).split(path.sep).join("/"), readFileSync(abs, "utf8"));
    }
  }
}

function main() {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const files = new Map();
  for (const dir of SCANNED_DIRS) collect(root, dir, files);
  const hits = findColorLiterals(files);
  for (const h of hits) console.error(`${h.file}:${h.line}: literal warna: ${h.text}`);
  if (hits.length > 0) {
    console.error(`\ncheck-tokens gagal: ${hits.length} literal warna. Pakai token dari src/styles/globals.css.`);
    process.exit(1);
  }
  console.log(`check-tokens lulus: ${files.size} berkas dipindai, tidak ada literal warna.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
