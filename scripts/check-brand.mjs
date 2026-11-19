// Gagal bila identitas klien lama muncul di file yang dilacak git (Req 23.4).
// Pemakaian: node scripts/check-brand.mjs [folder-repo]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? process.cwd());

// Dirangkai dari dua potongan supaya skrip ini sendiri tidak ikut terdeteksi.
const BRAND = new RegExp(["rahar", "djo"].join(""), "i");

// Dokumen spesifikasi menjelaskan aturan ini sehingga wajar menyebut kata tersebut.
const SKIPPED_PREFIXES = [".kiro/"];

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter((p) => p !== "");
}

function readText(file) {
  try {
    const buf = readFileSync(path.join(root, file));
    return buf.includes(0) ? null : buf.toString("utf8");
  } catch {
    return null;
  }
}

function findHits(file) {
  const hits = [];
  if (BRAND.test(file)) {
    hits.push(`${file}: nama file memuat identitas klien`);
  }
  const text = readText(file);
  if (text === null) {
    return hits;
  }
  text.split("\n").forEach((line, index) => {
    if (BRAND.test(line)) {
      hits.push(`${file}:${index + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
  return hits;
}

const hits = trackedFiles()
  .filter((file) => !SKIPPED_PREFIXES.some((prefix) => file.startsWith(prefix)))
  .flatMap(findHits);

if (hits.length > 0) {
  console.error(`check-brand GAGAL: ${hits.length} kemunculan identitas klien:`);
  for (const hit of hits) {
    console.error(`  ${hit}`);
  }
  process.exit(1);
}
console.log("check-brand lulus: tidak ada identitas klien di file terlacak.");
