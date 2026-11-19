import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLegacySettingsImport } from "@/data/legacySettingsImport";
import { UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8 } from "@/data/migrations";
import { DEFAULT_SETTINGS } from "@/data/settings";
import { settingByKey } from "@/domain/settings/definitions";
import { mapLegacySettings } from "@/domain/settings/legacyImport";
import { validateValue } from "@/domain/settings/validate";
import { openSqlJsDb } from "@/testing/sqlJsDb";
describe("mapLegacySettings", () => {
  it("pembulatan 500 mengaktifkan pembulatan dengan kelipatan 500", () => {
    const plan = mapLegacySettings({ ...DEFAULT_SETTINGS, roundingStep: 500 });
    expect(plan.values).toEqual({ "pajak.pembulatan_aktif": true, "pajak.pembulatan_kelipatan": 500 });
    expect(plan.defaulted).toEqual([]);
  });
  it("pembulatan 0 mematikan pembulatan saja", () => {
    expect(mapLegacySettings({ roundingStep: 0 }).values).toEqual({ "pajak.pembulatan_aktif": false });
  });
  it("nilai di luar rentang jatuh ke default (tidak ditulis)", () => {
    const plan = mapLegacySettings({ roundingStep: 250 });
    expect(plan.values).toEqual({});
    expect(plan.defaulted).toEqual(["pajak.pembulatan_kelipatan"]);
  });
  it("mencatat field lama yang tidak punya kunci registry", () => {
    expect(mapLegacySettings(DEFAULT_SETTINGS).unmapped).toContain("serviceChargeRp");
    expect(mapLegacySettings({}).unmapped).toEqual([]);
  });
  it("masukan bukan objek menghasilkan rencana kosong", () => {
    for (const bad of [null, 3, "x", [1]]) expect(mapLegacySettings(bad).values).toEqual({});
  });
  it("properti: setiap nilai hasil selalu lolos validasi registry", () => {
    fc.assert(
      fc.property(fc.anything(), (step) => {
        const plan = mapLegacySettings({ roundingStep: step });
        for (const [key, value] of Object.entries(plan.values)) {
          const def = settingByKey(key);
          expect(def).toBeDefined();
          expect(validateValue(def!, value)).toBeNull();
        }
      }),
    );
  });
});
type Db = Awaited<ReturnType<typeof openSqlJsDb>>;
let db: Db;
beforeEach(async () => {
  db = await openSqlJsDb();
  for (const batch of [UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8]) {
    for (const s of batch) await db.exec(s);
  }
});
afterEach(() => db.close());
function makeImport(text: string | null) {
  const state = { cleared: 0 };
  const imp = createLegacySettingsImport({ read: () => text, clear: () => void state.cleared++, now: () => "2026-11-19T00:00:00.000Z" });
  return { ...imp, state };
}
const rows = () => db.query<{ key: string; value: string; updated_by: string }>("SELECT key, value, updated_by FROM app_settings ORDER BY key");
describe("createLegacySettingsImport", () => {
  it("menyalin nilai ke app_settings dan menunda penghapusan ke afterCommit", async () => {
    const { hook, afterCommit, state } = makeImport(JSON.stringify({ roundingStep: 1000 }));
    await hook(db);
    expect(await rows()).toEqual([
      { key: "pajak.pembulatan_aktif", value: "true", updated_by: "migrasi" },
      { key: "pajak.pembulatan_kelipatan", value: "1000", updated_by: "migrasi" },
    ]);
    expect(state.cleared).toBe(0);
    await afterCommit();
    expect(state.cleared).toBe(1);
  });
  it("idempoten dan tidak menimpa nilai yang sudah diatur owner", async () => {
    await db.run("INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)", ["pajak.pembulatan_kelipatan", "100", "t", "u-owner"]);
    const { hook } = makeImport(JSON.stringify({ roundingStep: 500 }));
    await hook(db);
    await hook(db);
    const all = await rows();
    expect(all.find((r) => r.key === "pajak.pembulatan_kelipatan")).toMatchObject({ value: "100", updated_by: "u-owner" });
    expect(all).toHaveLength(2);
  });
  it("tanpa data lama atau JSON rusak: tidak menulis dan tidak menghapus", async () => {
    for (const text of [null, "{rusak"]) {
      const { hook, afterCommit, state } = makeImport(text);
      await hook(db);
      await afterCommit();
      expect(state.cleared).toBe(0);
    }
    expect(await rows()).toEqual([]);
  });
});
