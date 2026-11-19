/** Pure text helpers for the receipt formatter. Widths count code points. */
export type ReceiptLang = "id" | "en";

function isControl(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code <= 0x1f || code === 0x7f;
}

/** Remove U+0000–U+001F and U+007F so user text can never inject printer commands. */
export function sanitize(text: string): string {
  return Array.from(text).filter((ch) => !isControl(ch)).join("");
}

function len(text: string): number {
  return Array.from(text).length;
}

/**
 * Wrap by code point. Breaks at spaces when possible; tokens longer than
 * `width` are force-broken. Only separator spaces at break points are dropped.
 */
export function wrap(text: string, width: number): string[] {
  const max = Math.max(1, Math.floor(width));
  const lines: string[] = [];
  let current = "";
  let currentLen = 0;
  for (const word of text.split(" ")) {
    if (word === "") continue;
    let cps = Array.from(word);
    while (cps.length > max) {
      if (currentLen > 0) {
        lines.push(current);
        current = "";
        currentLen = 0;
      }
      lines.push(cps.slice(0, max).join(""));
      cps = cps.slice(max);
    }
    const rest = cps.join("");
    if (currentLen === 0) {
      current = rest;
      currentLen = cps.length;
    } else if (currentLen + 1 + cps.length <= max) {
      current = `${current} ${rest}`;
      currentLen += 1 + cps.length;
    } else {
      lines.push(current);
      current = rest;
      currentLen = cps.length;
    }
  }
  if (currentLen > 0) lines.push(current);
  return lines;
}

/** Wrap `text` after a prefix; continuation lines are indented to the prefix width. */
export function prefixed(prefix: string, text: string, width: number): string[] {
  const plen = len(prefix);
  const rows = wrap(text, Math.max(1, width - plen));
  return rows.map((row, i) => (i === 0 ? prefix : " ".repeat(plen)) + row);
}

/**
 * Left text wrapped (leading spaces kept as indent), amount right-aligned on
 * the last line. The amount is never split; when it leaves no room for text
 * it goes on its own line.
 */
export function twoColumn(left: string, right: string, width: number): string[] {
  const rightLen = len(right);
  const indent = left.length - left.trimStart().length;
  if (right === "") return prefixed(" ".repeat(indent), left, width);
  const room = width - rightLen - 1;
  if (room <= indent) {
    return [...prefixed(" ".repeat(indent), left, width), right.padStart(Math.max(width, rightLen))];
  }
  const rows = prefixed(" ".repeat(indent), left, room);
  if (rows.length === 0) return [right.padStart(width)];
  const last = rows[rows.length - 1] ?? "";
  rows[rows.length - 1] = last + " ".repeat(Math.max(1, width - len(last) - rightLen)) + right;
  return rows;
}

export function centerLines(text: string, width: number): string[] {
  return wrap(text, width).map((row) => " ".repeat(Math.floor((width - len(row)) / 2)) + row);
}

export function rule(width: number, ch = "-"): string {
  return ch.repeat(width);
}

/** Integer Rupiah with thousands separators ("." for id, "," for en). */
export function formatAmount(amountRp: number, lang: ReceiptLang): string {
  const safe = Number.isFinite(amountRp) ? Math.trunc(amountRp) : 0;
  const sep = lang === "id" ? "." : ",";
  const digits = String(Math.abs(safe)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return `${safe < 0 ? "-" : ""}Rp${digits}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** DD/MM/YYYY HH:mm in the Date's local time. */
export function formatDateTime(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
