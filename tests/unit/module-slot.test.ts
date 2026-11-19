import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { Slot } from "@/components/Slot";
import { CORE_MIGRATION_VERSIONS } from "@/data/migration/steps";
import { moduleRegistry } from "@/services/moduleRegistry";
import { registerModules } from "@/modules";
const Extra: ComponentType<{ label: string }> = ({ label }) => createElement("b", null, label);
afterEach(() => moduleRegistry.setActive([]));
describe("Slot", () => {
  it("tidak merender apa pun tanpa modul aktif", () => {
    expect(renderToStaticMarkup(createElement(Slot, { name: "cart.extra" }))).toBe("");
  });
  it("merender kontribusi modul aktif saja", () => {
    moduleRegistry.register({ id: "slot-test", name: { id: "t", en: "t" }, dependsOn: [], settingKeys: [], migrations: [], nav: [], slots: { "cart.extra": Extra } });
    expect(renderToStaticMarkup(createElement(Slot, { name: "cart.extra", props: { label: "meja" } }))).toBe("");
    moduleRegistry.setActive(["slot-test"]);
    expect(renderToStaticMarkup(createElement(Slot, { name: "cart.extra", props: { label: "meja" } }))).toBe("<b>meja</b>");
  });
});
describe("registerModules", () => {
  it("mendaftarkan modul fnb dan pelanggan, keduanya belum aktif", () => {
    const loaded = registerModules(moduleRegistry, CORE_MIGRATION_VERSIONS);
    expect(loaded.declarations.map((d) => d.id).sort()).toEqual(["fnb", "pelanggan"]);
    expect(loaded.migrations.map((m) => m.version).sort((a, b) => a - b)).toEqual([15, 16, 17]);
    expect(moduleRegistry.activeIds()).toEqual([]);
  });
});
