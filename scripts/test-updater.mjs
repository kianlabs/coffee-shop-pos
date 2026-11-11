import assert from "node:assert/strict";
import {
  isNewerVersion,
  APP_UPDATE_COOLDOWN_MS,
  APP_UPDATE_LAST_CHECK_KEY,
} from "../src/services/appUpdater.ts";

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

console.log("✓ Semua pengujian logika semver updater & cooldown LULUS (9 assertions)!");
