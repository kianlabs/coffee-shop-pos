import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { definitionProblems, duplicateKeys, loadRegistry, unregisteredCalls } from "../../scripts/check-settings.mjs";
import { validateValue } from "@/domain/settings/validate";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts/check-settings.mjs");
const good = { key: "a.b", type: "int", default: 5, min: 1, max: 10, label: { id: "A", en: "A" }, help: { id: "Bantuan", en: "Help" } };

describe("check-settings: definisi", () => {
  it("lulus untuk definisi lengkap dan unik", () => {
    expect(definitionProblems([good], validateValue)).toEqual([]);
    expect(duplicateKeys([good, { ...good, key: "a.c" }])).toEqual([]);
  });

  it("menyebut kunci tanpa default, label, atau bantuan", () => {
    const noDefault = { ...good, key: "x.default", default: undefined };
    const noLabel = { ...good, key: "x.label", label: { id: "", en: "Label" } };
    const noHelp = { ...good, key: "x.help", help: { id: "Bantuan" } };
    expect(definitionProblems([noDefault, noLabel, noHelp], validateValue)).toEqual([
      { key: "x.default", problem: "tidak punya nilai default" },
      { key: "x.label", problem: "tidak punya label.id" },
      { key: "x.help", problem: "tidak punya help.en" },
    ]);
  });

  it("menyebut default di luar rentang atau opsi", () => {
    const outOfRange = { ...good, default: 11 };
    const badOption = { ...good, key: "a.e", type: "enum", default: "z", options: ["x", "y"] };
    const problems = definitionProblems([outOfRange, badOption], validateValue);
    expect(problems.map((p: { key: string }) => p.key)).toEqual(["a.b", "a.e"]);
    expect(problems[0].problem).toMatch(/antara 1 dan 10/);
  });

  it("menyebut kunci duplikat", () => {
    expect(duplicateKeys([good, good, { ...good, key: "a.c" }])).toEqual(["a.b"]);
  });
});

describe("check-settings: pemindai pemanggilan", () => {
  const keys = new Set(["a.b"]);

  it("lulus untuk kunci terdaftar dan argumen non-literal", () => {
    const files = new Map([["src/x.ts", 'settings.get("a.b"); this.settings.set(`a.b`, 1, o); settings.get(key); other.get("zzz");']]);
    expect(unregisteredCalls(files, keys)).toEqual([]);
  });

  it("menyebut setiap pemanggilan get/use/set/setMany/reset dengan kunci tidak terdaftar", () => {
    const text = [
      'settings.get("a.b");',
      'deps.settings.use("tidak.ada");',
      "settings.set(`juga.tidak`, 1, owner);",
      'settings.setMany({ "a.b": 1, "lain.x": 2 }, owner);',
      'settings.reset(["a.b", "lain.y"], owner);',
    ].join("\n");
    expect(unregisteredCalls(new Map([["src/f.tsx", text]]), keys)).toEqual([
      { file: "src/f.tsx", line: 2, method: "use", key: "tidak.ada" },
      { file: "src/f.tsx", line: 3, method: "set", key: "juga.tidak" },
      { file: "src/f.tsx", line: 4, method: "setMany", key: "lain.x" },
      { file: "src/f.tsx", line: 5, method: "reset", key: "lain.y" },
    ]);
  });
});

describe("check-settings: repo fixture", () => {
  let dir = "";
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function fixture(source: string): ReturnType<typeof spawnSync> {
    dir = mkdtempSync(path.join(tmpdir(), "check-settings-fixture-"));
    cpSync(path.join(ROOT, "src/domain/settings"), path.join(dir, "src/domain/settings"), { recursive: true });
    mkdirSync(path.join(dir, "src/features"), { recursive: true });
    writeFileSync(path.join(dir, "src/features/demo.ts"), source);
    return spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
  }

  it("registry asli memuat semua kunci", async () => {
    const { settings } = await loadRegistry(ROOT);
    expect(settings.length).toBeGreaterThan(60);
  });

  it("lulus bila kode hanya memakai kunci terdaftar", () => {
    const result = fixture('settings.get("pajak.tarif_bp");\n');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/check-settings lulus/);
  });

  it("gagal dan menyebut berkas, baris, dan kunci yang tidak terdaftar", () => {
    const result = fixture('\nsettings.get("pajak.tidak_ada");\n');
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/src\/features\/demo\.ts:2: settings\.get memakai kunci tidak terdaftar "pajak\.tidak_ada"/);
  });
});
