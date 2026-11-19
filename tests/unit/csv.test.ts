import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CsvParseError, decodeCsv, encodeCsv, escapeFormula } from "@/domain/csv";

describe("encodeCsv", () => {
  it("uses CRLF and quotes commas, quotes and newlines", () => {
    const out = encodeCsv([["a,b", 'say "hi"', "l1\nl2"], ["x", "y", "z"]]);
    expect(out).toBe('"a,b","say ""hi""","l1\nl2"\r\nx,y,z\r\n');
  });
  it("has no BOM and keeps emoji", () => {
    const out = encodeCsv([["kopi ☕😀"]]);
    expect(out.charCodeAt(0)).not.toBe(0xfeff);
    expect(decodeCsv(out)).toEqual([["kopi ☕😀"]]);
  });
  it("writes null as empty and numbers verbatim", () => {
    expect(encodeCsv([["a", null, -5]])).toBe("a,,-5\r\n");
  });
  it("returns empty string for no rows", () => {
    expect(encodeCsv([])).toBe("");
  });
  it("escapes formula starters in text but not numbers", () => {
    expect(encodeCsv([["=1+1", "+x", "-x", "@x", "\tx", "ok", -3]])).toBe("'=1+1,'+x,'-x,'@x,'\tx,ok,-3\r\n");
    expect(escapeFormula("plain")).toBe("plain");
  });
  it("can disable formula escaping", () => {
    expect(encodeCsv([["=A1"]], { escapeFormulas: false })).toBe("=A1\r\n");
  });
  it("quotes a lone empty cell so the row survives", () => {
    expect(decodeCsv(encodeCsv([[""], ["a"]]))).toEqual([[""], ["a"]]);
  });
  it("round-trips text starting with a BOM character", () => {
    expect(decodeCsv(encodeCsv([["\uFEFFx", "y"]], { escapeFormulas: false }))).toEqual([["\uFEFFx", "y"]]);
  });
});

describe("decodeCsv", () => {
  it("strips a leading BOM", () => {
    expect(decodeCsv("\uFEFFa,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("accepts LF, CR and missing final newline", () => {
    expect(decodeCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(decodeCsv("a\r1")).toEqual([["a"], ["1"]]);
  });
  it("keeps empty cells, including trailing ones", () => {
    expect(decodeCsv("a,,c\r\n,\r\nx,")).toEqual([["a", "", "c"], ["", ""], ["x", ""]]);
  });
  it("skips blank lines but keeps quoted-empty rows", () => {
    expect(decodeCsv("a\r\n\r\n\"\"\r\n")).toEqual([["a"], [""]]);
  });
  it("reads embedded newlines and escaped quotes", () => {
    expect(decodeCsv('"a\r\nb","c""d"\r\n')).toEqual([["a\r\nb", 'c"d']]);
  });
  it("treats a quote inside an unquoted field literally", () => {
    expect(decodeCsv('ab"c,d')).toEqual([['ab"c', "d"]]);
  });
  it("returns [] for empty input", () => {
    expect(decodeCsv("")).toEqual([]);
  });
  it("throws with line number on unterminated quote", () => {
    try {
      decodeCsv('a\r\n"oops');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CsvParseError);
      expect((e as CsvParseError).line).toBe(2);
    }
  });
  it("throws on junk after a closing quote", () => {
    expect(() => decodeCsv('"a"b,c')).toThrow(CsvParseError);
  });
});

describe("CSV round trip (property, task 17.7)", () => {
  const cell = fc.oneof(fc.string({ unit: "binary" }), fc.constantFrom(",", '"', "\n", "\r\n", ' ,"\n', "é☕😀"));
  const rows = fc.array(fc.array(cell, { minLength: 1, maxLength: 5 }), { maxLength: 8 });
  it("parse(encode(x)) equals x for arbitrary text", () => {
    fc.assert(
      fc.property(rows, (r) => {
        expect(decodeCsv(encodeCsv(r, { escapeFormulas: false }))).toEqual(r);
      }),
      { numRuns: 300 },
    );
  });
  it("encode(parse(encode(x))) is byte-identical", () => {
    fc.assert(
      fc.property(rows, (r) => {
        const once = encodeCsv(r, { escapeFormulas: false });
        expect(encodeCsv(decodeCsv(once), { escapeFormulas: false })).toBe(once);
      }),
      { numRuns: 200 },
    );
  });
  it("with escaping, only formula starters gain a leading apostrophe", () => {
    fc.assert(
      fc.property(rows, (r) => {
        const back = decodeCsv(encodeCsv(r));
        expect(back).toEqual(r.map((row) => row.map(escapeFormula)));
      }),
      { numRuns: 200 },
    );
  });
});
