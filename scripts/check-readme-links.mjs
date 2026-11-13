// Memeriksa README.md dan README.id.md (Req 23.1, 23.2):
//  - setiap tautan relatif dan gambar menunjuk ke file yang ada
//  - tautan ke versi bahasa lain ada di 10 baris pertama
//  - ada minimal 3 gambar tangkapan layar
//  - kedua README memuat jumlah bagian (##) yang sama
// Pemakaian: node scripts/check-readme-links.mjs [folder-repo]
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? process.cwd());
const PAIRS = [
  { file: "README.md", other: "README.id.md" },
  { file: "README.id.md", other: "README.md" },
];
const MIN_SCREENSHOTS = 3;

const errors = [];

function read(file) {
  const full = path.join(root, file);
  if (!existsSync(full)) {
    errors.push(`${file}: file tidak ada`);
    return null;
  }
  return readFileSync(full, "utf8");
}

/** Hapus blok kode agar contoh perintah tidak dianggap tautan. */
function stripCode(text) {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

function relativeTargets(text) {
  const targets = [];
  const markdown = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const html = /(?:href|src)="([^"]+)"/g;
  for (const re of [markdown, html]) {
    for (const match of text.matchAll(re)) {
      targets.push(match[1]);
    }
  }
  return targets.filter((t) => !/^(https?:|mailto:|#|data:)/i.test(t));
}

function checkLinks(file, text) {
  for (const target of relativeTargets(stripCode(text))) {
    const clean = decodeURIComponent(target.split("#")[0].split("?")[0]);
    if (clean === "") {
      continue;
    }
    if (!existsSync(path.join(root, clean))) {
      errors.push(`${file}: tautan/gambar rusak -> ${target}`);
    }
  }
}

function checkImages(file, text) {
  const count = [...stripCode(text).matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].length;
  if (count < MIN_SCREENSHOTS) {
    errors.push(`${file}: hanya ${count} gambar, minimal ${MIN_SCREENSHOTS}`);
  }
}

function checkLanguageLink(file, other, text) {
  const head = text.split("\n").slice(0, 10).join("\n");
  if (!head.includes(`(${other})`)) {
    errors.push(`${file}: tautan ke ${other} tidak ada di 10 baris pertama`);
  }
}

function sectionCount(text) {
  return [...stripCode(text).matchAll(/^## /gm)].length;
}

const texts = new Map();
for (const { file, other } of PAIRS) {
  const text = read(file);
  if (text === null) {
    continue;
  }
  texts.set(file, text);
  checkLinks(file, text);
  checkImages(file, text);
  checkLanguageLink(file, other, text);
}

const en = texts.get("README.md");
const id = texts.get("README.id.md");
if (en && id && sectionCount(en) !== sectionCount(id)) {
  errors.push(
    `jumlah bagian (##) berbeda: README.md=${sectionCount(en)}, README.id.md=${sectionCount(id)}`,
  );
}

if (errors.length > 0) {
  console.error(`check-readme-links GAGAL: ${errors.length} masalah:`);
  for (const e of errors) {
    console.error(`  ${e}`);
  }
  process.exit(1);
}
console.log("check-readme-links lulus: tautan, gambar, dan struktur README valid.");
