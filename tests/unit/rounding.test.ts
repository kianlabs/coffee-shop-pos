import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { divRoundHalfUp, roundToMultiple, type RoundingStep } from "@/domain/rounding";
describe("divRoundHalfUp", () => {
  it("membulatkan setengah ke atas", () => {
    expect(divRoundHalfUp(5, 10)).toBe(1);
    expect(divRoundHalfUp(4, 10)).toBe(0);
    expect(divRoundHalfUp(15, 10)).toBe(2);
    expect(divRoundHalfUp(14_999, 10_000)).toBe(1);
    expect(divRoundHalfUp(0, 7)).toBe(0);
    expect(divRoundHalfUp(7, 7)).toBe(1);
  });
  it("tepat pada batas aman", () => {
    const max = Number.MAX_SAFE_INTEGER;
    expect(divRoundHalfUp(max, 1)).toBe(max);
    expect(divRoundHalfUp(max, 3)).toBe(3_002_399_751_580_330);
    expect(divRoundHalfUp(max, 2)).toBe(4_503_599_627_370_496);
  });
  it("melempar RangeError di luar batas aman atau masukan salah", () => {
    expect(() => divRoundHalfUp(Number.MAX_SAFE_INTEGER + 1, 1)).toThrow(RangeError);
    expect(() => divRoundHalfUp(999_999_999_999 * 10_000, 10_000)).toThrow(RangeError);
    expect(() => divRoundHalfUp(1.5, 1)).toThrow(RangeError);
    expect(() => divRoundHalfUp(-1, 1)).toThrow(RangeError);
    expect(() => divRoundHalfUp(1, 0)).toThrow(RangeError);
    expect(() => divRoundHalfUp(1, -2)).toThrow(RangeError);
    expect(() => divRoundHalfUp(Number.NaN, 2)).toThrow(RangeError);
  });
  it("sama dengan pembulatan matematis setengah ke atas", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e12 }), fc.integer({ min: 1, max: 1e6 }), (n, d) => {
        const q = divRoundHalfUp(n, d);
        // q is the integer closest to n/d with ties going up.
        expect(2 * n >= (2 * q - 1) * d).toBe(true);
        expect(2 * n < (2 * q + 1) * d).toBe(true);
      }),
    );
  });
});
describe("roundToMultiple", () => {
  it("setengah kelipatan dibulatkan ke atas", () => {
    expect(roundToMultiple(150, 100)).toEqual({ rounded: 200, roundingRp: 50 });
    expect(roundToMultiple(149, 100)).toEqual({ rounded: 100, roundingRp: -49 });
    expect(roundToMultiple(12_250, 500)).toEqual({ rounded: 12_500, roundingRp: 250 });
    expect(roundToMultiple(12_249, 500)).toEqual({ rounded: 12_000, roundingRp: -249 });
    expect(roundToMultiple(23_500, 1000)).toEqual({ rounded: 24_000, roundingRp: 500 });
    expect(roundToMultiple(0, 1000)).toEqual({ rounded: 0, roundingRp: 0 });
    expect(roundToMultiple(23_000, 1000)).toEqual({ rounded: 23_000, roundingRp: 0 });
  });
  it("melempar RangeError untuk total negatif atau di luar batas aman", () => {
    expect(() => roundToMultiple(-1, 100)).toThrow(RangeError);
    expect(() => roundToMultiple(Number.MAX_SAFE_INTEGER, 1000)).toThrow(RangeError);
  });
  it("hasil kelipatan, selisih ≤ setengah kelipatan", () => {
    const step = fc.constantFrom<RoundingStep>(100, 500, 1000);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e12 }), step, (total, s) => {
        const { rounded, roundingRp } = roundToMultiple(total, s);
        expect(rounded % s).toBe(0);
        expect(rounded - total).toBe(roundingRp);
        expect(Math.abs(roundingRp)).toBeLessThanOrEqual(s / 2);
        expect(rounded).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});
