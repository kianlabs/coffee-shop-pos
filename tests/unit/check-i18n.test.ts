import { describe, expect, it } from "vitest";
import { missingKeys } from "../../scripts/check-i18n.mjs";

describe("check-i18n", () => {
  it("lulus bila kedua bahasa punya kunci yang sama", () => {
    expect(missingKeys({ id: { a: "1", b: "2" }, en: { b: "x", a: "y" } })).toEqual([]);
  });

  it("melaporkan kunci yang hilang di bahasa mana pun", () => {
    expect(missingKeys({ id: { a: "1", b: "2" }, en: { a: "x" } })).toEqual([{ locale: "en", key: "b" }]);
    expect(missingKeys({ id: { a: "1" }, en: { a: "x", c: "z" } })).toEqual([{ locale: "id", key: "c" }]);
  });
});
