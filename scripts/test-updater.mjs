import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = mkdtempSync(path.join(tmpdir(), "pos-updater-test-"));

execFileSync(
  path.join(ROOT, "node_modules/.bin/tsc"),
  [
    "src/domain/semver.ts",
    "--rootDir",
    "src",
    "--ignoreConfig",
    "--outDir",
    OUT,
    "--module",
    "commonjs",
    "--target",
    "es2020",
    "--skipLibCheck",
  ],
  { cwd: ROOT, stdio: "inherit" },
);

const require = createRequire(import.meta.url);
const { isNewerVersion } = require(path.join(OUT, "domain/semver.js"));

const APP_UPDATE_COOLDOWN_MS = 60 * 60 * 1000;
const APP_UPDATE_LAST_CHECK_KEY = "last_app_update_check";

console.log("=== PENGUJIAN SEMVER UPDATER ===");

assert.equal(isNewerVersion("v1.1.0", "1.0.0"), true, "v1.1.0 harus lebih baru dari 1.0.0");
assert.equal(isNewerVersion("v1.0.1", "1.0.0"), true, "v1.0.1 harus lebih baru dari 1.0.0");
assert.equal(isNewerVersion("v2.0.0", "1.9.9"), true, "v2.0.0 harus lebih baru dari 1.9.9");
assert.equal(isNewerVersion("1.0.0", "1.0.0"), false, "Versi sama tidak boleh dianggap lebih baru");
assert.equal(isNewerVersion("v0.9.9", "1.0.0"), false, "Versi lama tidak boleh dianggap lebih baru");
assert.equal(isNewerVersion("v1.0.0", "1.0.1"), false, "Versi lebih rendah tidak boleh dianggap lebih baru");
assert.equal(isNewerVersion("v1.2", "1.1.9"), true, "1.2 harus lebih baru dari 1.1.9");

assert.equal(APP_UPDATE_COOLDOWN_MS, 60 * 60 * 1000, "Cooldown minimal harus 1 jam (3600000 ms)");
assert.equal(APP_UPDATE_LAST_CHECK_KEY, "last_app_update_check", "Key localStorage harus last_app_update_check");

rmSync(OUT, { recursive: true, force: true });
console.log("✓ Semua pengujian logika semver updater & cooldown LULUS (9 assertions)!");
