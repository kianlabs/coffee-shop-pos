import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { checkBudget, initialAssets, measure } from "../../scripts/check-bundle-size.mjs";
const INDEX = `<script type="module" crossorigin src="/assets/index-a.js"></script>
<link rel="modulepreload" crossorigin href="/assets/vendor-b.js">
<link rel="stylesheet" crossorigin href="/assets/index-c.css">
<link rel="icon" href="/favicon.svg">`;
// Pseudo-random text so gzip size is predictable and large enough to measure.
const noise = (n: number) => Array.from({ length: n }, (_, i) => ((i * 2654435761) >>> 7).toString(36)).join("");
const FILES: Record<string, string> = {
  "assets/index-a.js": `import{x}from"./dep-d.js";const lazy=()=>import("./lazy-e.js");${noise(3000)}`,
  "assets/vendor-b.js": noise(2000),
  "assets/dep-d.js": noise(1000),
  "assets/lazy-e.js": noise(9000),
  "assets/index-c.css": noise(500),
};
const read = (f: string) => {
  const text = FILES[f];
  if (text === undefined) throw new Error(`missing ${f}`);
  return Buffer.from(text);
};
describe("check-bundle-size", () => {
  it("menghitung entri, modulepreload, dan impor statis; mengabaikan impor dinamis", () => {
    const { js, css } = initialAssets(INDEX, (f) => read(f).toString());
    expect(js).toEqual(["assets/dep-d.js", "assets/index-a.js", "assets/vendor-b.js"]);
    expect(css).toEqual(["assets/index-c.css"]);
  });
  it("mengukur gzip hanya berkas awal", () => {
    const r = measure(INDEX, read);
    const expected = (["index-a", "vendor-b", "dep-d"] as const).reduce((a, n) => a + gzipSync(read(`assets/${n}.js`)).length, 0) / 1024;
    expect(r.jsKb).toBeCloseTo(expected, 5);
  });
  it("lulus bila di bawah anggaran", () => {
    const r = measure(INDEX, read);
    expect(checkBudget(r, { initialJsGzipKb: r.jsKb + 1, initialCssGzipKb: r.cssKb + 1 })).toEqual([]);
  });
  it("gagal bila JS atau CSS melebihi anggaran", () => {
    const r = measure(INDEX, read);
    expect(checkBudget(r, { initialJsGzipKb: r.jsKb - 1, initialCssGzipKb: r.cssKb + 1 })).toHaveLength(1);
    expect(checkBudget(r, { initialJsGzipKb: 0, initialCssGzipKb: 0 })).toHaveLength(2);
  });
  it("gagal bila index.html tanpa skrip awal", () => {
    const r = measure("<html></html>", read);
    expect(checkBudget(r, { initialJsGzipKb: 10, initialCssGzipKb: 10 })).toHaveLength(1);
  });
});
