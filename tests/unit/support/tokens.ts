import { readFileSync } from "node:fs";
import path from "node:path";

const CSS_PATH = path.resolve(import.meta.dirname, "../../../src/styles/globals.css");

/** Reads `--name: value;` declarations from one selector block in globals.css. */
export function readTokens(selector: ":root" | '[data-contrast="high"]'): Record<string, string> {
  const css = readFileSync(CSS_PATH, "utf8");
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Blok ${selector} tidak ditemukan di globals.css`);
  const body = css.slice(start, css.indexOf("}", start));
  const tokens: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim();
  }
  return tokens;
}
