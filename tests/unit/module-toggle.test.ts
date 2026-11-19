import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createModuleUnitOfWork } from "@/data/repos/moduleRepo";
import fnb from "@/modules/fnb/module";
import pelanggan from "@/modules/pelanggan/module";
import { ModuleRegistry, moduleRegistry } from "@/services/moduleRegistry";
import { ModuleService } from "@/services/moduleService";
import { fixedClock, sequentialIds } from "@/testing/memory/settings";
import { openSqlJsDb } from "@/testing/sqlJsDb";
import { migrate, type Db } from "./support/migrationHarness";
const owner = { id: "u-owner", role: "owner" } as const;
const nav = { id: "x", icon: "Tag", labelKey: "x", route: "/x", minRole: "kasir" } as const;
type Slots = { "cart.extra": string };
let db: Db;
let registry: ModuleRegistry<Slots>;
let service: ModuleService;
const count = async (t: string) => (await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`))[0].n;
const MODULE_TABLES = ["modifier_groups", "customers", "promos", "queue_counters"];
const counts = async () => Object.fromEntries(await Promise.all(MODULE_TABLES.map(async (t) => [t, await count(t)])));

beforeEach(async () => {
  db = await openSqlJsDb();
  await db.exec("PRAGMA foreign_keys = ON");
  await migrate(db);
  registry = new ModuleRegistry<Slots>();
  registry.register({ ...fnb, nav: [nav], slots: { "cart.extra": "fnb-ui" } });
  registry.register({ ...pelanggan, nav: [{ ...nav, id: "y" }], slots: { "cart.extra": "pelanggan-ui" } });
  service = new ModuleService({
    uow: createModuleUnitOfWork(db),
    registry: registry as unknown as ModuleRegistry,
    clock: fixedClock(),
    ids: sequentialIds("audit"),
  });
  await db.run("INSERT INTO modifier_groups (id, name, min_select, max_select) VALUES ('g1', 'Gula', 0, 1)");
  await db.run("INSERT INTO customers (id, name, phone, created_at) VALUES ('c1', 'Budi', '0812345678', 'x')");
  await db.run("INSERT INTO queue_counters (business_day, last_no) VALUES ('2026-01-01', 7)");
});
afterEach(() => db.close());

describe("mengaktifkan dan menonaktifkan modul fnb dan pelanggan", () => {
  it("modul nonaktif secara bawaan: tidak ada slot dan navigasi", () => {
    expect(registry.slots("cart.extra")).toEqual([]);
    expect(registry.navItems()).toEqual([]);
  });

  it("aktif memunculkan slot dan navigasi, nonaktif menyembunyikannya", async () => {
    await service.enable("fnb", owner);
    await service.enable("pelanggan", owner);
    expect(registry.slots("cart.extra")).toEqual(["fnb-ui", "pelanggan-ui"]);
    expect(registry.navItems()).toHaveLength(2);
    await service.disable("pelanggan", owner, true);
    expect(registry.slots("cart.extra")).toEqual(["fnb-ui"]);
    await service.disable("fnb", owner, true);
    expect(registry.slots("cart.extra")).toEqual([]);
    expect(registry.navItems()).toEqual([]);
  });

  it("jumlah baris tabel modul tidak berubah saat nonaktif dan aktif kembali", async () => {
    const before = await counts();
    expect(before).toEqual({ modifier_groups: 1, customers: 2, promos: 0, queue_counters: 1 });
    await service.enable("fnb", owner);
    await service.enable("pelanggan", owner);
    await service.disable("fnb", owner, true);
    await service.disable("pelanggan", owner, true);
    expect(await counts()).toEqual(before);
    await service.enable("fnb", owner);
    await service.enable("pelanggan", owner);
    expect(await counts()).toEqual(before);
    expect(await db.query("SELECT name FROM customers WHERE id = 'c1'")).toEqual([{ name: "Budi" }]);
  });

  it("fnb dan pelanggan tidak saling bergantung", async () => {
    expect(await service.enable("pelanggan", owner)).toEqual({ ok: true, changed: true });
    expect(await service.enable("fnb", owner)).toEqual({ ok: true, changed: true });
    expect(await service.disable("fnb", owner, true)).toEqual({ ok: true, changed: true });
    expect(registry.isActive("pelanggan")).toBe(true);
  });

  it("nonaktifkan lewat registry global tetap kosong tanpa modul terdaftar", () => {
    expect(moduleRegistry.slots("anything")).toEqual([]);
  });
});
