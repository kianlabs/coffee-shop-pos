import { describe, expect, it } from "vitest";
import { fromLegacyVoidPin, hashPin, verifyPin } from "@/data/pinHash";
import { hashVoidPin } from "@/data/settings";

const FAST = 1000;

describe("pinHash", () => {
  it("uses the pbkdf2$sha256$iter$salt$hash format", async () => {
    const h = await hashPin("1234", FAST);
    const parts = h.split("$");
    expect(parts.slice(0, 3)).toEqual(["pbkdf2", "sha256", "1000"]);
    expect(atob(parts[3])).toHaveLength(16);
    expect(atob(parts[4])).toHaveLength(32);
  });

  it("refuses to hash an empty PIN", async () => {
    await expect(hashPin("", FAST)).rejects.toThrow("PIN tidak boleh kosong.");
  });
  it("creates a unique salt per hash", async () => {
    expect(await hashPin("1234", FAST)).not.toBe(await hashPin("1234", FAST));
  });

  it("accepts the right PIN and rejects a wrong or empty one", async () => {
    const h = await hashPin("1234", FAST);
    expect(await verifyPin("1234", h)).toBe(true);
    expect(await verifyPin("1235", h)).toBe(false);
    expect(await verifyPin("", h)).toBe(false);
  });

  it("uses the iteration count stored in the hash", async () => {
    const h = await hashPin("9999", 2000);
    expect(await verifyPin("9999", h)).toBe(true);
    expect(await verifyPin("9999", h.replace("$2000$", "$2001$"))).toBe(false);
  });

  it("rejects malformed hashes", async () => {
    const h = await hashPin("1234", FAST);
    for (const bad of ["", "x", "pbkdf2$sha256$0$a$b", h.replace("sha256", "sha1"), `${h}$x`, h.slice(0, -4)]) {
      expect(await verifyPin("1234", bad)).toBe(false);
    }
    await expect(hashPin("1", 0)).rejects.toThrow();
  });

  it("verifies existing hashVoidPin output without re-hashing", async () => {
    const legacy = await hashVoidPin("4821");
    const stored = fromLegacyVoidPin(legacy.hash, legacy.salt);
    expect(stored).not.toBeNull();
    expect(stored).toBe(`pbkdf2$sha256$600000$${legacy.salt}$${legacy.hash}`);
    expect(await verifyPin("4821", stored as string)).toBe(true);
    expect(await verifyPin("4822", stored as string)).toBe(false);
  });

  it("refuses invalid legacy values", () => {
    expect(fromLegacyVoidPin("", "")).toBeNull();
    expect(fromLegacyVoidPin("abc", "def")).toBeNull();
  });
});
