import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLegacyOwnerHook, legacyPinHash, LEGACY_OWNER_ID } from "@/data/migration/hooks/legacyOwner";
import { NO_LEGACY, NOW, migrate, openAt, userVersion, type Db } from "./support/migrationHarness";
import { openSqlJsDb } from "@/testing/sqlJsDb";
const HASH = "A".repeat(43) + "="; // 32 bytes
const SALT = "B".repeat(22) + "=="; // 16 bytes
const settings = (extra: Record<string, unknown> = {}) => JSON.stringify({ voidPinHash: HASH, voidPinSalt: SALT, ...extra });
let db: Db;
beforeEach(async () => {
  db = await openSqlJsDb();
});
afterEach(() => db.close());
describe("migrasi V9 users", () => {
  it("fresh: tabel users ada dan kosong tanpa PIN lama", async () => {
    expect(await migrate(db, NO_LEGACY, 9)).toContain(9);
    expect(await db.query("SELECT id FROM users")).toEqual([]);
    expect(await userVersion(db)).toBe(9);
  });
  it("PIN supervisor lama menjadi satu owner dengan hash dibawa tanpa hash ulang", async () => {
    await migrate(db, { ...NO_LEGACY, settings: settings() }, 9);
    const rows = await db.query<Record<string, unknown>>("SELECT * FROM users");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: LEGACY_OWNER_ID, display_name: "Owner", display_name_ci: "owner", role: "owner", is_active: 1,
      pin_hash: `pbkdf2$sha256$600000$${SALT}$${HASH}`, failed_attempts: 0, created_at: NOW,
    });
  });
  it("hook diulang tidak menggandakan pengguna", async () => {
    const hook = createLegacyOwnerHook({ legacy: { ...NO_LEGACY, settings: settings() }, now: () => NOW });
    db.close();
    db = await openAt(9);
    await hook(db);
    await hook(db);
    expect(await db.query("SELECT id FROM users")).toHaveLength(1);
  });
  it("tidak menimpa pengguna yang sudah ada", async () => {
    db.close();
    db = await openAt(9);
    await db.run(
      "INSERT INTO users (id, display_name, display_name_ci, role, pin_hash, created_at, updated_at) VALUES ('u1','Budi','budi','kasir','x',?,?)",
      [NOW, NOW],
    );
    await createLegacyOwnerHook({ legacy: { ...NO_LEGACY, settings: settings() }, now: () => NOW })(db);
    expect(await db.query("SELECT id FROM users")).toEqual([{ id: "u1" }]);
  });
  it.each([
    ["JSON rusak", "{bukan json"],
    ["bukan objek", "[1]"],
    ["hash terlalu pendek", JSON.stringify({ voidPinHash: "QQ==", voidPinSalt: SALT })],
    ["tanpa salt", JSON.stringify({ voidPinHash: HASH })],
    ["base64 tidak valid", JSON.stringify({ voidPinHash: "***", voidPinSalt: SALT })],
  ])("PIN lama tidak valid (%s) tidak membuat pengguna", async (_name, raw) => {
    expect(legacyPinHash(raw)).toBeNull();
    const logs: string[] = [];
    db.close();
    db = await openAt(9);
    await createLegacyOwnerHook({ legacy: { ...NO_LEGACY, settings: raw }, now: () => NOW, log: (m) => logs.push(m) })(db);
    expect(await db.query("SELECT id FROM users")).toEqual([]);
    expect(logs).toHaveLength(1);
  });
  it("nama aktif unik tanpa memandang huruf besar, nama nonaktif boleh sama", async () => {
    db.close();
    db = await openAt(9);
    const insert = (id: string, ci: string, active: number) =>
      db.run(
        "INSERT INTO users (id, display_name, display_name_ci, role, pin_hash, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
        [id, ci, ci, "kasir", "x", active, NOW, NOW],
      );
    await insert("a", "ani", 1);
    await expect(insert("b", "ani", 1)).rejects.toThrow();
    await insert("c", "ani", 0);
    await expect(db.run("UPDATE users SET role = 'admin' WHERE id = 'a'")).rejects.toThrow();
  });
});
