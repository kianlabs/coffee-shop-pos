// Menyalin hasil `vite build` ke assets Android tanpa Capacitor CLI
// (CLI butuh Node >= 22, mesin ini Node 20). Isi yang disalin sama persis
// dengan yang dilakukan `npx cap copy android`.
import { cpSync, existsSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");
const TARGET = path.join(ROOT, "android/app/src/main/assets/public");

if (!existsSync(path.join(DIST, "index.html"))) {
  console.error("dist/index.html tidak ada — jalankan `npm run build` dulu.");
  process.exit(1);
}

rmSync(TARGET, { recursive: true, force: true });
cpSync(DIST, TARGET, { recursive: true });

const html = readFileSync(path.join(TARGET, "index.html"), "utf8");
const hash = html.match(/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? "(tidak ketemu)";
console.log(`assets Android disinkronkan: ${hash}`);
