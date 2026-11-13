// Gagal bila ada file .apk yang dilacak git (Req 23.6, 23.12).
// APK hanya boleh dilampirkan ke GitHub Releases.
// Pemakaian: node scripts/check-no-apk.mjs [folder-repo]
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? process.cwd());

const out = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const apks = out
  .split("\0")
  .filter((file) => file !== "" && file.toLowerCase().endsWith(".apk"));

if (apks.length > 0) {
  console.error(`check-no-apk GAGAL: ${apks.length} file APK terlacak git:`);
  for (const file of apks) {
    console.error(`  ${file}`);
  }
  console.error("Lampirkan APK ke GitHub Releases, jangan commit ke repositori.");
  process.exit(1);
}
console.log("check-no-apk lulus: tidak ada file APK terlacak.");
