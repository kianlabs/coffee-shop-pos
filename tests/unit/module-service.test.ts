import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createModuleUnitOfWork } from "@/data/repos/moduleRepo";
import { UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8 } from "@/data/migrations";
import type { ModuleDeclaration } from "@/domain/modules/types";
import { ModuleRegistry } from "@/services/moduleRegistry";
import { ModuleService } from "@/services/moduleService";
import { fixedClock, sequentialIds } from "@/testing/memory/settings";
import { openSqlJsDb } from "@/testing/sqlJsDb";
type Db = Awaited<ReturnType<typeof openSqlJsDb>>;
const owner = { id: "u-owner", role: "owner" } as const;
const decl = (id: string, dependsOn: string[] = []): ModuleDeclaration => ({ id, name: { id: `Modul ${id}`, en: id }, dependsOn, settingKeys: [], migrations: [], nav: [] });
let db: Db;
let registry: ModuleRegistry;
let data = false;
function service(): ModuleService {
  return new ModuleService({ uow: createModuleUnitOfWork(db), registry, clock: fixedClock(), ids: sequentialIds("audit"), hasData: async () => data });
}
const flags = () => db.query("SELECT id, enabled, enabled_at, updated_by FROM modules ORDER BY id");
const audits = () => db.query<{ action: string; actor_id: string; entity_id: string; created_at: string }>("SELECT action, actor_id, entity_id, created_at FROM audit_logs");
beforeEach(async () => {
  db = await openSqlJsDb();
  for (const batch of [UPGRADE_V1, UPGRADE_V2, UPGRADE_V3, UPGRADE_V4, UPGRADE_V5, UPGRADE_V6, UPGRADE_V7, UPGRADE_V8]) {
    for (const s of batch) await db.exec(s);
  }
  registry = new ModuleRegistry();
  registry.register(decl("fnb"));
  registry.register(decl("kitchen", ["fnb"]));
  data = false;
});
afterEach(() => db.close());
describe("ModuleService", () => {
  it("enable ditolak dengan nama dependensi yang belum aktif", async () => {
    const r = await service().enable("kitchen", owner);
    expect(r).toMatchObject({ ok: false, code: "missing_dependencies", modules: ["fnb"] });
    expect(r.ok === false && r.message).toContain("Modul fnb");
    expect(await flags()).toEqual([]);
  });
  it("enable menyimpan flag dan mengaktifkan registry tanpa restart", async () => {
    const s = service();
    expect(await s.enable("fnb", owner)).toEqual({ ok: true, changed: true });
    expect(registry.isActive("fnb")).toBe(true);
    expect(await flags()).toEqual([{ id: "fnb", enabled: 1, enabled_at: "2026-11-19T00:00:00.000Z", updated_by: "u-owner" }]);
    expect(await s.enable("fnb", owner)).toEqual({ ok: true, changed: false });
    expect(await s.enable("kitchen", owner)).toMatchObject({ ok: true });
  });
  it("load memulihkan status aktif dari SQLite", async () => {
    await service().enable("fnb", owner);
    registry.setActive([]);
    await service().load();
    expect(registry.activeIds()).toEqual(["fnb"]);
  });
  it("disable menulis audit dalam transaksi yang sama dan tidak menyentuh data modul", async () => {
    const s = service();
    await s.enable("fnb", owner);
    expect(await s.disable("fnb", owner)).toEqual({ ok: true, changed: true });
    expect(registry.isActive("fnb")).toBe(false);
    expect(await flags()).toEqual([{ id: "fnb", enabled: 0, enabled_at: null, updated_by: "u-owner" }]);
    expect(await audits()).toEqual([{ action: "module.disable", actor_id: "u-owner", entity_id: "fnb", created_at: "2026-11-19T00:00:00.000Z" }]);
  });
  it("disable modul berdata meminta konfirmasi lebih dulu", async () => {
    const s = service();
    await s.enable("fnb", owner);
    data = true;
    expect(await s.disable("fnb", owner)).toMatchObject({ ok: false, code: "confirm_required" });
    expect(registry.isActive("fnb")).toBe(true);
    expect(await audits()).toEqual([]);
    expect(await s.disable("fnb", owner, true)).toMatchObject({ ok: true });
    expect(await audits()).toHaveLength(1);
  });
  it("disable ditolak selama modul lain yang aktif bergantung padanya", async () => {
    const s = service();
    await s.enable("fnb", owner);
    await s.enable("kitchen", owner);
    expect(await s.disable("fnb", owner)).toMatchObject({ ok: false, code: "has_dependents", modules: ["kitchen"] });
  });
  it("hanya owner dan hanya modul terdaftar", async () => {
    const s = service();
    expect(await s.enable("fnb", { id: "k", role: "kasir" })).toMatchObject({ code: "forbidden" });
    expect(await s.disable("fnb", { id: "k", role: "supervisor" })).toMatchObject({ code: "forbidden" });
    expect(await s.enable("hantu", owner)).toMatchObject({ code: "not_found" });
    expect(await flags()).toEqual([]);
  });
  it("disable yang sudah nonaktif tidak mengubah apa pun", async () => {
    expect(await service().disable("fnb", owner)).toEqual({ ok: true, changed: false });
  });
  it("audit gagal membatalkan perubahan flag (rollback) dan registry tetap aktif", async () => {
    const s = service();
    await s.enable("fnb", owner);
    await db.exec("DROP TABLE audit_logs");
    expect(await s.disable("fnb", owner)).toMatchObject({ ok: false, code: "save_failed" });
    expect(registry.isActive("fnb")).toBe(true);
    expect(await flags()).toEqual([{ id: "fnb", enabled: 1, enabled_at: "2026-11-19T00:00:00.000Z", updated_by: "u-owner" }]);
  });
});
