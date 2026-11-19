import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
const SCRIPT = path.resolve("scripts/check-bundle-size.mjs");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
/** Fixture repo with a ~1 KB gzip entry script and the given budget. */
function fixture(budget: { initialJsGzipKb: number; initialCssGzipKb: number }, withDist = true): string {
  const root = mkdtempSync(path.join(tmpdir(), "pos-bundle-"));
  dirs.push(root);
  mkdirSync(path.join(root, "scripts"));
  writeFileSync(path.join(root, "scripts/bundle-budget.json"), JSON.stringify(budget));
  if (!withDist) return root;
  mkdirSync(path.join(root, "dist/assets"), { recursive: true });
  writeFileSync(path.join(root, "dist/index.html"), '<script type="module" src="/assets/a.js"></script><link rel="stylesheet" href="/assets/a.css">');
  const noise = Array.from({ length: 400 }, (_, i) => ((i * 2654435761) >>> 5).toString(36)).join("");
  writeFileSync(path.join(root, "dist/assets/a.js"), noise);
  writeFileSync(path.join(root, "dist/assets/a.css"), "body{color:red}");
  return root;
}
const run = (root: string, ...args: string[]) => spawnSync(process.execPath, [SCRIPT, root, ...args], { encoding: "utf8" });
describe("check-bundle-size CLI", () => {
  it("lulus dengan dist di bawah anggaran", () => {
    const r = run(fixture({ initialJsGzipKb: 100, initialCssGzipKb: 100 }), "--require-dist");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("lulus");
  });
  it("gagal bila JS melebihi anggaran", () => {
    const r = run(fixture({ initialJsGzipKb: 0.1, initialCssGzipKb: 100 }), "--require-dist");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("melebihi anggaran");
  });
  it("gagal bila dist tidak ada dan --require-dist dipakai", () => {
    expect(run(fixture({ initialJsGzipKb: 1, initialCssGzipKb: 1 }, false), "--require-dist").status).toBe(1);
  });
  it("dilewati tanpa --require-dist (dipanggil run-checks)", () => {
    const r = run(fixture({ initialJsGzipKb: 0, initialCssGzipKb: 0 }));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("dilewati");
  });
});
