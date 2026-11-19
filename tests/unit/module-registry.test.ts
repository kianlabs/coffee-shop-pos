import { describe, expect, it, vi } from "vitest";
import type { ModuleDeclaration } from "@/domain/modules/types";
import { ModuleRegistry } from "@/services/moduleRegistry";
type Slots = { "cart.extra": string; "report.sections": string[] };
const nav = (id: string) => ({ id, icon: "x", labelKey: `nav.${id}`, route: `/${id}`, minRole: "kasir" as const });
const decl = (id: string, slots?: Partial<Slots>, dependsOn: string[] = []): ModuleDeclaration<Partial<Slots>> => ({
  id,
  name: { id, en: id },
  dependsOn,
  settingKeys: [],
  migrations: [],
  nav: [nav(id)],
  slots,
});
function make() {
  const r = new ModuleRegistry<Slots>();
  r.register(decl("fnb", { "cart.extra": "meja" }));
  r.register(decl("pelanggan", { "cart.extra": "pelanggan", "report.sections": ["lap"] }));
  return r;
}
describe("ModuleRegistry", () => {
  it("tanpa modul aktif: slot dan navigasi kosong", () => {
    const r = make();
    expect(r.slots("cart.extra")).toEqual([]);
    expect(r.navItems()).toEqual([]);
    expect(r.activeIds()).toEqual([]);
  });
  it("slot hanya dari modul aktif, urut registrasi", () => {
    const r = make();
    r.setActive(["pelanggan"]);
    expect(r.slots("cart.extra")).toEqual(["pelanggan"]);
    r.setActive(["pelanggan", "fnb"]);
    expect(r.slots("cart.extra")).toEqual(["meja", "pelanggan"]);
    expect(r.slots("report.sections")).toEqual([["lap"]]);
    expect(r.navItems().map((n) => n.id)).toEqual(["fnb", "pelanggan"]);
  });
  it("status aktif reaktif: pendengar dipanggil saat berubah, tidak saat sama", () => {
    const r = make();
    const fn = vi.fn();
    const off = r.subscribe(fn);
    const v0 = r.getSnapshot();
    r.setActive(["fnb"]);
    r.setActive(["fnb"]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(r.getSnapshot()).toBe(v0 + 1);
    off();
    r.setActive([]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(r.isActive("fnb")).toBe(false);
  });
  it("id yang tidak terdaftar diabaikan", () => {
    const r = make();
    r.setActive(["hantu"]);
    expect(r.activeIds()).toEqual([]);
  });
  it("menolak id ganda dan memvalidasi dependensi", () => {
    const r = make();
    expect(() => r.register(decl("fnb"))).toThrow(/sudah terdaftar/);
    r.register(decl("x", undefined, ["tidak-ada"]));
    const result = r.validate([1, 2]);
    expect(result.ok).toBe(false);
    expect(r.get("x")?.id).toBe("x");
    expect(r.declarations()).toHaveLength(3);
  });
  it("validasi lulus mengembalikan urutan", () => {
    expect(make().validate([1])).toEqual({ ok: true, order: ["fnb", "pelanggan"] });
  });
});
