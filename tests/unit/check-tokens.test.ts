import { describe, expect, it } from "vitest";
import { findColorLiterals } from "../../scripts/check-tokens.mjs";

const scan = (text: string) => findColorLiterals(new Map([["src/features/a/A.tsx", text]])).length;

describe("check-tokens", () => {
  it("menolak hex, rgb, dan hsl di komponen dan fitur", () => {
    expect(scan('<div style={{ color: "#fff" }} />')).toBe(1);
    expect(scan('const c = "rgba(0, 0, 0, 0.5)";')).toBe(1);
    expect(scan('const c = "hsl(120 50% 50%)";')).toBe(1);
  });

  it("menerima token dan angka biasa", () => {
    expect(scan('<div className="bg-card text-muted-foreground" />')).toBe(0);
    expect(scan("const total = 18000; const id = `key-${total}`;")).toBe(0);
  });
});
