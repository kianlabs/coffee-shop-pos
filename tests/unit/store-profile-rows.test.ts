import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8 } from "@/data/migrations";
import { createSettingsRepo } from "@/data/repos/settingsRepo";
import { STORE_PROFILE_SELECT, storeProfileStatements } from "@/data/storeProfile";
import { decodeStoredText, profileFromRows, type SettingRow, type StoreProfile } from "@/domain/storeProfile";
import { openSqlJsDb } from "@/testing/sqlJsDb";

type Db = Awaited<ReturnType<typeof openSqlJsDb>>;
let db: Db;
const NOW = "2026-11-19T00:00:00.000Z";
const profile: StoreProfile = {
  name: "Kopi Suro",
  address: "Jl. Mawar 1",
  npwp: "",
  logoB64: "",
  receiptHeader: "Selamat datang",
  receiptFooter: 'Terima "kasih", 123',
};

async function loadProfile(): Promise<StoreProfile> {
  const rows = await db.query<{ key: string; value: string }>(STORE_PROFILE_SELECT);
  return profileFromRows(rows as SettingRow[]);
}

beforeEach(async () => {
  db = await openSqlJsDb();
  for (const batch of [UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8]) {
    for (const s of batch) await db.exec(s);
  }
});
afterEach(() => db.close());

describe("store profile rows on sql.js", () => {
  it("loads a legacy plain-text row", async () => {
    await db.run("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)", ["struk.footer", "Terima kasih", NOW]);
    expect((await loadProfile()).receiptFooter).toBe("Terima kasih");
  });

  it("loads a JSON-encoded row", async () => {
    await db.run("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)", ["struk.header", '"Halo"', NOW]);
    expect((await loadProfile()).receiptHeader).toBe("Halo");
  });

  it("keeps numeric-looking plain text as text", () => {
    expect(decodeStoredText("123")).toBe("123");
    expect(decodeStoredText("true")).toBe("true");
    expect(decodeStoredText('"x')).toBe('"x');
  });

  it("writes JSON and SettingsRepo reads back the same strings", async () => {
    for (const s of storeProfileStatements(profile, NOW)) await db.run(s.statement, s.values as (string | number | null)[]);
    const stored = await db.query<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", ["struk.footer"]);
    expect(stored[0].value).toBe(JSON.stringify(profile.receiptFooter));
    const all = await createSettingsRepo(db).loadAll();
    const byKey = new Map(all.map((r) => [r.key, r.value]));
    expect(byKey.get("struk.header")).toBe(profile.receiptHeader);
    expect(byKey.get("struk.footer")).toBe(profile.receiptFooter);
    expect(byKey.get("toko.nama")).toBe(profile.name);
    expect(await loadProfile()).toEqual(profile);
  });

  it("a SettingsRepo write is read by the profile loader", async () => {
    await createSettingsRepo(db).put({ key: "struk.footer", value: "Dari registry", updatedAt: NOW, updatedBy: "u1" });
    expect((await loadProfile()).receiptFooter).toBe("Dari registry");
  });
});
