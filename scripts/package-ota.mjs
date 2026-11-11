import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distZip = path.join(root, "dist.zip");
const distZipSha256 = path.join(root, "dist.zip.sha256");

console.log("\n📦 [1/3] Menjalankan npm run build...");
execSync("npm run build", { cwd: root, stdio: "inherit" });

if (fs.existsSync(distZip)) {
  fs.unlinkSync(distZip);
}
if (fs.existsSync(distZipSha256)) {
  fs.unlinkSync(distZipSha256);
}

console.log("\n🗜️  [2/3] Mengompresi folder dist menjadi dist.zip...");
execSync("cd dist && zip -r -9 ../dist.zip .", { cwd: root, stdio: "inherit" });

const stats = fs.statSync(distZip);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

const fileBuffer = fs.readFileSync(distZip);
const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");
fs.writeFileSync(distZipSha256, `${sha256}\n`, "utf8");

console.log("\n✅ [3/3] Paket OTA Berhasil Dibuat!");
console.log(`📍 File: ${distZip}`);
console.log(`🔑 SHA-256: ${sha256}`);
console.log(`📄 Checksum: ${distZipSha256}`);
console.log(`📊 Ukuran: ${sizeMb} MB (${stats.size.toLocaleString("id-ID")} bytes)`);
console.log("\n💡 Cara Rilis ke GitHub:");
console.log("   1. Buat tag baru:  git tag v1.0.1 && git push origin v1.0.1");
console.log("   2. GitHub Action akan otomatis membuat rilis & mengunggah dist.zip dan dist.zip.sha256.");
console.log("   3. ATAU unggah manual file dist.zip dan dist.zip.sha256 ke tab Releases di GitHub.\n");
