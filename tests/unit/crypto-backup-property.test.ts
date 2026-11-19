import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { decryptJson, encryptJson } from "@/data/cryptoBackup";

// Property 17: backup encryption round trip (Req 19.6, 19.7). Low iterations keep 100+ runs fast.
const FAST = { iterations: 10_000 };
const RUNS = { numRuns: 100 };
const plain = fc.string({ unit: "binary", maxLength: 300 });
const pass = fc.string({ unit: "binary", minLength: 1, maxLength: 40 });

function flipByte(b64: string, index: number): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  bytes[index % bytes.length] ^= 0x01;
  return btoa(String.fromCharCode(...bytes));
}

describe("backup encryption properties", () => {
  it("round trip returns the identical document", async () => {
    await fc.assert(
      fc.asyncProperty(plain, pass, async (text, p) => {
        // Lone surrogates do not survive UTF-8, so compare against the encoded form.
        const normalized = new TextDecoder().decode(new TextEncoder().encode(text));
        expect(await decryptJson(await encryptJson(normalized, p, FAST), p)).toBe(normalized);
      }),
      RUNS,
    );
  });

  it("a different passphrase is rejected and reveals nothing", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 8, maxLength: 200 }), pass, pass, async (text, p, q) => {
        fc.pre(p !== q);
        const env = await encryptJson(text, p, FAST);
        const err = await decryptJson(env, q).then(
          () => null,
          (e: unknown) => (e instanceof Error ? e.message : String(e)),
        );
        expect(err).toBe("Passphrase salah atau file rusak.");
      }),
      RUNS,
    );
  });

  it("any flipped ciphertext byte is rejected without plaintext output", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 8, maxLength: 200 }), pass, fc.nat(), async (text, p, at) => {
        const env = JSON.parse(await encryptJson(text, p, FAST)) as Record<string, string>;
        env.data = flipByte(env.data, at);
        const err = await decryptJson(JSON.stringify(env), p).then(
          () => null,
          (e: unknown) => (e instanceof Error ? e.message : String(e)),
        );
        expect(err).toBe("Passphrase salah atau file rusak.");
        expect(err).not.toContain(text);
      }),
      RUNS,
    );
  });

  it("tampered iv or salt is rejected", async () => {
    await fc.assert(
      fc.asyncProperty(pass, fc.nat(), fc.constantFrom("iv", "salt"), async (p, at, field) => {
        const env = JSON.parse(await encryptJson('{"a":1}', p, FAST)) as Record<string, string>;
        env[field] = flipByte(env[field], at);
        await expect(decryptJson(JSON.stringify(env), p)).rejects.toThrow();
      }),
      RUNS,
    );
  });
});
