import { describe, expect, it } from "vitest";
import { contrastRatio } from "./support/contrast";
import { readTokens } from "./support/tokens";

const normal = readTokens(":root");
const high = { ...normal, ...readTokens('[data-contrast="high"]') };

// Teks normal: WCAG AA ≥ 4.5:1. Kontras tinggi: ≥ 7:1.
const NORMAL_PAIRS: Array<[string, string]> = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["muted-foreground", "background"],
  ["muted-foreground", "muted"],
  ["primary-foreground", "primary"],
  ["destructive", "background"],
  ["success", "success-soft"],
  ["warning", "warning-soft"],
  ["info", "info-soft"],
];

describe("kontras token (WCAG AA)", () => {
  for (const [fg, bg] of NORMAL_PAIRS) {
    it(`${fg} di atas ${bg} ≥ 4,5:1`, () => {
      expect(contrastRatio(normal[fg], normal[bg])).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("kontras tinggi (data-contrast=high)", () => {
  it("teks utama dan teks sekunder ≥ 7:1 di atas latar", () => {
    expect(contrastRatio(high.foreground, high.background)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(high["muted-foreground"], high.background)).toBeGreaterThanOrEqual(7);
  });
});
