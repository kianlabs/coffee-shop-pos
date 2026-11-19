import { describe, expect, it } from "vitest";
import {
  decryptJson,
  encryptJson,
  ENC_BACKUP_FORMAT,
  ENC_BACKUP_FORMAT_V1,
  isEncryptedBackup,
  PBKDF2_ITERATIONS,
} from "@/data/cryptoBackup";
import fixtures from "../fixtures/enc-backups.json";

// Fixtures were produced before this task changed anything: v2 by the old encryptJson, v1 by the v1 recipe (PBKDF2 100k).
const { passphrase, plaintext, v1, v2 } = fixtures;

function mutate(json: string, patch: (e: Record<string, unknown>) => void): string {
  const e = JSON.parse(json) as Record<string, unknown>;
  patch(e);
  return JSON.stringify(e);
}

describe("cryptoBackup compatibility", () => {
  it("decrypts the stored pos-enc-v1 fixture", async () => {
    expect(JSON.parse(v1).format).toBe(ENC_BACKUP_FORMAT_V1);
    expect(await decryptJson(v1, passphrase)).toBe(plaintext);
  });

  it("decrypts the stored pos-enc-v2 fixture made by the earlier code", async () => {
    const env = JSON.parse(v2) as Record<string, unknown>;
    expect(env.format).toBe(ENC_BACKUP_FORMAT);
    expect(env.iterations).toBe(PBKDF2_ITERATIONS);
    expect(await decryptJson(v2, passphrase)).toBe(plaintext);
  });

  it("detects both formats", () => {
    expect(isEncryptedBackup(v1)).toBe(true);
    expect(isEncryptedBackup(v2)).toBe(true);
    expect(isEncryptedBackup('{"schemaVersion":3}')).toBe(false);
    expect(isEncryptedBackup("bukan json")).toBe(false);
  });

  it("rejects a wrong passphrase for v1 and v2", async () => {
    await expect(decryptJson(v1, "salah")).rejects.toThrow("Passphrase salah");
    await expect(decryptJson(v2, "salah")).rejects.toThrow("Passphrase salah");
  });

  it("writes the current format with header metadata", async () => {
    const out = JSON.parse(await encryptJson(plaintext, passphrase, { iterations: 20_000 })) as Record<string, unknown>;
    expect(out).toMatchObject({ format: "pos-enc-v2", kdf: "PBKDF2-SHA256", iterations: 20_000, cipher: "AES-GCM-256", schemaVersion: 3 });
    expect(out.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses a fresh salt and iv for every encryption", async () => {
    const a = JSON.parse(await encryptJson("{}", "p", { iterations: 10_000 })) as Record<string, string>;
    const b = JSON.parse(await encryptJson("{}", "p", { iterations: 10_000 })) as Record<string, string>;
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
  });

  it("rejects empty passphrase and unsafe iteration counts", async () => {
    await expect(encryptJson("{}", "")).rejects.toThrow("Passphrase");
    await expect(decryptJson(v2, "")).rejects.toThrow("Passphrase");
    await expect(encryptJson("{}", "p", { iterations: 10 })).rejects.toThrow("iterasi");
  });

  it("rejects malformed envelopes", async () => {
    await expect(decryptJson("bukan json", "p")).rejects.toThrow("tidak valid");
    await expect(decryptJson("null", "p")).rejects.toThrow("tidak valid");
    await expect(decryptJson('{"format":"x"}', "p")).rejects.toThrow("tidak dikenali");
    await expect(decryptJson(mutate(v2, (e) => delete e.salt), "p")).rejects.toThrow("tidak lengkap");
    await expect(decryptJson(mutate(v2, (e) => (e.iterations = 5)), "p")).rejects.toThrow("batas aman");
    await expect(decryptJson(mutate(v2, (e) => (e.iterations = "x")), "p")).rejects.toThrow("iterasi");
    await expect(decryptJson(mutate(v2, (e) => (e.salt = "AAAA")), "p")).rejects.toThrow("salt");
    await expect(decryptJson(mutate(v2, (e) => (e.iv = "AAAA")), "p")).rejects.toThrow("IV");
    await expect(decryptJson(mutate(v2, (e) => (e.data = "")), "p")).rejects.toThrow("kosong");
    await expect(decryptJson(mutate(v2, (e) => (e.data = "***")), "p")).rejects.toThrow("base64");
    await expect(decryptJson(mutate(v2, (e) => delete e.checksum), "p")).rejects.toThrow("checksum");
  });

  it("rejects a v2 header whose checksum was altered", async () => {
    const bad = mutate(v2, (e) => (e.checksum = "0".repeat(64)));
    await expect(decryptJson(bad, passphrase)).rejects.toThrow("Checksum");
  });
});
