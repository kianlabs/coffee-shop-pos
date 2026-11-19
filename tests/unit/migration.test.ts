import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isFutureSchema, pendingSteps, stepChecksum, validateChain, type MigrationStep } from "@/domain/migration";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const step = (version: number, statements: string[] = [`-- v${version}`]): MigrationStep => ({ version, statements });

describe("validateChain", () => {
  it("menerima rantai 1..n tanpa celah", () => {
    expect(validateChain([step(2), step(1), step(3)])).toBeNull();
    expect(validateChain([])).toBeNull();
  });

  it("menolak celah, duplikat, dan awal selain 1", () => {
    expect(validateChain([step(1), step(3)])).toMatch(/terputus/);
    expect(validateChain([step(1), step(1)])).toMatch(/duplikat/);
    expect(validateChain([step(2), step(3)])).toMatch(/dimulai dari versi 1/);
    expect(validateChain([step(0)])).toMatch(/tidak valid/);
  });

  it("rantai apa pun yang dibangun berurutan selalu lulus", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), (n) => {
        const steps = Array.from({ length: n }, (_, i) => step(i + 1));
        expect(validateChain(steps)).toBeNull();
      }),
    );
  });
});

describe("stepChecksum", () => {
  it("berubah bila statement atau nama hook berubah", () => {
    const base = stepChecksum(step(1, ["A"]), sha256);
    expect(stepChecksum(step(1, ["A"]), sha256)).toBe(base);
    expect(stepChecksum(step(1, ["B"]), sha256)).not.toBe(base);
    expect(stepChecksum({ ...step(1, ["A"]), hook: "h" }, sha256)).not.toBe(base);
  });
});

describe("pendingSteps dan isFutureSchema", () => {
  const steps = [step(1), step(2), step(3), step(4)];

  it("hanya memilih langkah di atas versi saat ini sampai latest", () => {
    expect(pendingSteps(steps, 2, 3).map((s) => s.version)).toEqual([3]);
    expect(pendingSteps(steps, 0, 4).map((s) => s.version)).toEqual([1, 2, 3, 4]);
    expect(pendingSteps(steps, 4, 4)).toEqual([]);
  });

  it("menandai skema di masa depan agar tidak dibuka", () => {
    expect(isFutureSchema(9, 8)).toBe(true);
    expect(isFutureSchema(8, 8)).toBe(false);
  });
});
