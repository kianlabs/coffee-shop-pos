import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { Slot } from "@/components/Slot";
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
  it("tanpa berkas module.ts tidak mendaftarkan apa pun", () => {
    const loaded = registerModules(moduleRegistry, [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(loaded).toEqual({ declarations: [], migrations: [] });
  });
});
