/** WCAG 2.1 contrast ratio for OKLCH colors. Out-of-gamut channels are clamped to 0..1. */

type Rgb = [number, number, number];

const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/;

function parseOklch(value: string): { l: number; c: number; h: number } {
  const m = OKLCH.exec(value);
  if (!m) throw new Error(`Bukan nilai oklch(): ${value}`);
  return { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]) };
}

function oklchToLinearSrgb(value: string): Rgb {
  const { l, c, h } = parseOklch(value);
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map((x) => Math.min(1, Math.max(0, x))) as Rgb;
}

export function relativeLuminance(value: string): number {
  const [r, g, b] = oklchToLinearSrgb(value);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
