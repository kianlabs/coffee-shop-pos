import { describe, expect, it } from "vitest";
import {
  evaluateManifest,
  parseOtaManifest,
  parseSha256File,
  shouldCheckForUpdate,
  verifyChecksum,
  type OtaManifest,
} from "@/services/updater";

const HASH = "a".repeat(63) + "b";
const manifest: OtaManifest = { version: "2.1.0", minNativeVersion: "2.0.0", schemaVersion: 8, sha256: HASH };
const ctx = { supportedSchemaVersion: 8, nativeVersion: "2.0.0", currentVersion: "2.0.0" };

describe("parseOtaManifest", () => {
  it("menerima objek dan string JSON yang valid, hash dinormalkan ke huruf kecil", () => {
    const raw = { ...manifest, sha256: HASH.toUpperCase() };
    expect(parseOtaManifest(raw)).toEqual({ ok: true, manifest });
    expect(parseOtaManifest(JSON.stringify(manifest))).toEqual({ ok: true, manifest });
  });
  it("menolak JSON rusak, bukan objek, dan field yang salah", () => {
    expect(parseOtaManifest("{").ok).toBe(false);
    expect(parseOtaManifest([]).ok).toBe(false);
    expect(parseOtaManifest(null).ok).toBe(false);
    for (const bad of [
      { ...manifest, version: "abc" },
      { ...manifest, minNativeVersion: 2 },
      { ...manifest, schemaVersion: 0 },
      { ...manifest, schemaVersion: 1.5 },
      { ...manifest, sha256: "xyz" },
      { version: "2.1.0" },
    ]) {
      expect(parseOtaManifest(bad).ok).toBe(false);
    }
  });
});

describe("evaluateManifest", () => {
  it("menerapkan versi lebih baru dengan skema yang didukung", () => {
    expect(evaluateManifest(manifest, ctx)).toEqual({ kind: "update", version: "2.1.0" });
  });
  it("menolak skema lebih baru dan menyebut versi APK minimum", () => {
    const r = evaluateManifest({ ...manifest, schemaVersion: 9, minNativeVersion: "2.2.0" }, ctx);
    expect(r.kind).toBe("reject");
    expect(r.kind === "reject" && r.message).toContain("2.2.0");
  });
  it("menolak bila APK terpasang lebih lama dari minNativeVersion", () => {
    expect(evaluateManifest({ ...manifest, minNativeVersion: "2.5.0" }, ctx).kind).toBe("reject");
  });
  it("versi sama atau lebih lama berarti sudah terbaru", () => {
    expect(evaluateManifest({ ...manifest, version: "2.0.0" }, ctx).kind).toBe("up-to-date");
    expect(evaluateManifest({ ...manifest, version: "v1.9.0" }, ctx).kind).toBe("up-to-date");
  });
});

describe("verifikasi checksum", () => {
  it("parseSha256File membaca token pertama, dengan atau tanpa nama berkas", () => {
    expect(parseSha256File(`${HASH}  dist.zip\n`)).toBe(HASH);
    expect(parseSha256File(HASH.toUpperCase())).toBe(HASH);
    expect(parseSha256File("")).toBeNull();
    expect(parseSha256File(null)).toBeNull();
    expect(parseSha256File("bukan-hash dist.zip")).toBeNull();
  });
  it("cocok", () => {
    expect(verifyChecksum(HASH, `${HASH}  dist.zip`)).toEqual({ ok: true });
    expect(verifyChecksum(HASH.toUpperCase(), HASH)).toEqual({ ok: true });
  });
  it("tidak cocok", () => {
    const r = verifyChecksum("c".repeat(64), HASH);
    expect(r).toMatchObject({ ok: false, reason: "mismatch" });
  });
  it("berkas checksum hilang atau rusak", () => {
    expect(verifyChecksum(HASH, null)).toMatchObject({ ok: false, reason: "missing" });
    expect(verifyChecksum(HASH, "rusak")).toMatchObject({ ok: false, reason: "missing" });
  });
});

describe("shouldCheckForUpdate", () => {
  const H = 3_600_000;
  const base = { autoEnabled: true, intervalHours: 24, lastCheckAtMs: 1_000_000_000, nowMs: 1_000_000_000 };
  it("belum pernah memeriksa: periksa", () => {
    expect(shouldCheckForUpdate({ ...base, lastCheckAtMs: null })).toBe(true);
  });
  it("menghormati interval", () => {
    expect(shouldCheckForUpdate({ ...base, nowMs: base.nowMs + 24 * H - 1 })).toBe(false);
    expect(shouldCheckForUpdate({ ...base, nowMs: base.nowMs + 24 * H })).toBe(true);
  });
  it("interval dijepit ke 1..168 jam dan nilai tak valid memakai 24", () => {
    expect(shouldCheckForUpdate({ ...base, intervalHours: 0, nowMs: base.nowMs + H })).toBe(true);
    expect(shouldCheckForUpdate({ ...base, intervalHours: 1000, nowMs: base.nowMs + 167 * H })).toBe(false);
    expect(shouldCheckForUpdate({ ...base, intervalHours: 1000, nowMs: base.nowMs + 168 * H })).toBe(true);
    expect(shouldCheckForUpdate({ ...base, intervalHours: Number.NaN, nowMs: base.nowMs + 23 * H })).toBe(false);
  });
  it("otomatis mati: hanya manual yang memeriksa", () => {
    expect(shouldCheckForUpdate({ ...base, autoEnabled: false, lastCheckAtMs: null })).toBe(false);
    expect(shouldCheckForUpdate({ ...base, autoEnabled: false, manual: true })).toBe(true);
  });
  it("jam mundur memicu pemeriksaan", () => {
    expect(shouldCheckForUpdate({ ...base, nowMs: base.nowMs - 5 })).toBe(true);
  });
});
