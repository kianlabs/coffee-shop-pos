import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8 } from "@/data/migrations";
import { openSqlJsDb } from "@/testing/sqlJsDb";

type Db = Awaited<ReturnType<typeof openSqlJsDb>>;
let db: Db;

beforeEach(async () => {
  db = await openSqlJsDb();
  for (const batch of [UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8]) {
    for (const s of batch) await db.exec(s);
  }
  await db.run("INSERT INTO audit_logs (id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?)", ["a1", "x", "t", "1", "2026-11-19"]);
});
afterEach(() => db.close());

describe("migrasi V8", () => {
  it("menambah kolom dan tabel modules", async () => {
    const cols = (await db.query<{ name: string }>("PRAGMA table_info(audit_logs)")).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(["approver_id", "action_type"]));
    const settingCols = (await db.query<{ name: string }>("PRAGMA table_info(app_settings)")).map((c) => c.name);
    expect(settingCols).toContain("updated_by");
    const mods = (await db.query<{ name: string }>("PRAGMA table_info(modules)")).map((c) => c.name);
    expect(mods).toEqual(expect.arrayContaining(["id", "enabled", "enabled_at", "updated_by"]));
  });

  it("audit_logs menolak UPDATE dan DELETE", async () => {
    await expect(db.exec("UPDATE audit_logs SET reason = 'ubah' WHERE id = 'a1'")).rejects.toThrow(/append-only/);
    await expect(db.exec("DELETE FROM audit_logs WHERE id = 'a1'")).rejects.toThrow(/append-only/);
    expect(await db.query("SELECT id FROM audit_logs")).toEqual([{ id: "a1" }]);
  });

  it("modules menolak nilai enabled selain 0 atau 1", async () => {
    await expect(db.exec("INSERT INTO modules (id, enabled) VALUES ('fnb', 2)")).rejects.toThrow();
  });
});
