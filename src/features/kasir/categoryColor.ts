/** Six muted category colors from globals.css, assigned by category position. */
const CATEGORY_TONES = [
  { bg: "bg-cat-1", text: "text-cat-1" },
  { bg: "bg-cat-2", text: "text-cat-2" },
  { bg: "bg-cat-3", text: "text-cat-3" },
  { bg: "bg-cat-4", text: "text-cat-4" },
  { bg: "bg-cat-5", text: "text-cat-5" },
  { bg: "bg-cat-6", text: "text-cat-6" },
] as const;

export type CategoryTone = (typeof CATEGORY_TONES)[number];

export function categoryTone(index: number): CategoryTone {
  const safe = index >= 0 ? index : 0;
  return CATEGORY_TONES[safe % CATEGORY_TONES.length];
}

/**
 * Up to two initials for the product tile monogram. Words that start with a
 * letter win ("08.20 Escobar" -> "E"); names without letters use digits.
 */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+/u, "")).filter(Boolean);
  const lettered = words.filter((w) => /^\p{L}/u.test(w));
  const source = lettered.length > 0 ? lettered : words;
  return source.slice(0, 2).map((w) => [...w][0]).join("").toUpperCase();
}
