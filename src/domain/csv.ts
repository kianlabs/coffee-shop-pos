/** CSV RFC 4180: CRLF, kutip ganda, UTF-8 tanpa BOM saat ekspor, toleran BOM saat impor. */
export type CsvCell = string | number | null;
export type EncodeOptions = {
  /**
   * Awali sel teks yang berawalan = + - @ TAB CR dengan `'` agar tidak dieksekusi
   * sebagai rumus oleh spreadsheet. Angka (number) tidak pernah diubah.
   * Default true. Matikan hanya untuk data yang harus kembali persis (round trip).
   */
  escapeFormulas?: boolean;
};
export class CsvParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = "CsvParseError";
  }
}
const BOM = "\uFEFF";
const FORMULA_START = /^[=+\-@\t\r]/;
export function escapeFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}
function encodeCell(cell: CsvCell, escape: boolean, soleCell: boolean): string {
  if (cell === null) return soleCell ? '""' : "";
  const text = typeof cell === "number" ? String(cell) : escape ? escapeFormula(cell) : cell;
  const needsQuote = /[",\r\n]/.test(text) || (soleCell && text === "");
  return needsQuote ? `"${text.replaceAll('"', '""')}"` : text;
}
/** Baris dipisah CRLF, ada CRLF penutup. Daftar baris kosong menghasilkan string kosong. */
export function encodeCsv(rows: readonly (readonly CsvCell[])[], options: EncodeOptions = {}): string {
  const escape = options.escapeFormulas ?? true;
  const body = rows.map((row) => row.map((c) => encodeCell(c, escape, row.length === 1)).join(",") + "\r\n").join("");
  // BOM di awal data harus dibedakan dari BOM penanda file.
  return body.startsWith(BOM) ? BOM + body : body;
}
type Parser = { rows: string[][]; row: string[]; field: string; quoted: boolean };
function finishRow(p: Parser): void {
  const blank = p.row.length === 0 && p.field === "" && !p.quoted;
  if (!blank) p.rows.push([...p.row, p.field]);
  p.row = [];
  p.field = "";
  p.quoted = false;
}
/** Parse CSV. BOM awal dibuang. Pemisah baris CRLF, LF, atau CR. Baris kosong dilewati. */
export function decodeCsv(input: string): string[][] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const p: Parser = { rows: [], row: [], field: "", quoted: false };
  let inQuotes = false;
  let afterQuote = false;
  let line = 1;
  let openLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch !== '"') {
        if (ch === "\n") line += 1;
        p.field += ch;
      } else if (text[i + 1] === '"') {
        p.field += '"';
        i += 1;
      } else {
        inQuotes = false;
        afterQuote = true;
      }
      continue;
    }
    const isBreak = ch === "\r" || ch === "\n";
    if (afterQuote && ch !== "," && !isBreak) {
      throw new CsvParseError(`Karakter tak terduga setelah kutip penutup di baris ${line}.`, line);
    }
    if (ch === '"' && p.field === "" && !p.quoted) {
      inQuotes = true;
      p.quoted = true;
      openLine = line;
    } else if (ch === ",") {
      p.row.push(p.field);
      p.field = "";
      p.quoted = false;
      afterQuote = false;
      // Koma menandai baris sudah dimulai walau sel kosong.
    } else if (isBreak) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      finishRow(p);
      afterQuote = false;
      line += 1;
    } else {
      p.field += ch;
    }
  }
  if (inQuotes) {
    throw new CsvParseError(`Kutip ganda dibuka di baris ${openLine} tetapi tidak pernah ditutup.`, openLine);
  }
  finishRow(p);
  return p.rows;
}
