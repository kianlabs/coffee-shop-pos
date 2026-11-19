import { nameKey } from "@/domain/validationResult";
import type { Clock } from "@/services/ports";
import type { AuthTx, AuthUnitOfWork, PinHasher, UserRecord } from "@/services/ports/users";
import { createMemorySettingsDb, type MemorySettingsDb } from "./settings";
/** In-memory users table on top of the memory settings db. Test-only. */
export interface MemoryUserDb {
  base: MemorySettingsDb;
  uow: AuthUnitOfWork;
  users: Map<string, UserRecord>;
}
export function createMemoryUserDb(base: MemorySettingsDb = createMemorySettingsDb()): MemoryUserDb {
  const db: MemoryUserDb = { base, users: new Map(), uow: { transact: (fn) => base.uow.transact((tx) => guarded(tx, fn)) } };
  const clash = (user: UserRecord): boolean =>
    user.isActive && [...db.users.values()].some((u) => u.id !== user.id && u.isActive && nameKey(u.displayName) === nameKey(user.displayName));
  const store = {
    get: async (id: string) => structuredClone(db.users.get(id) ?? null),
    list: async () => structuredClone([...db.users.values()]),
    insert: async (user: UserRecord) => {
      if (db.users.has(user.id)) throw new Error("memory: duplicate user id");
      if (clash(user)) throw new Error("memory: unique active user name");
      db.users.set(user.id, structuredClone(user));
    },
    update: async (user: UserRecord) => {
      if (!db.users.has(user.id)) throw new Error("memory: unknown user");
      if (clash(user)) throw new Error("memory: unique active user name");
      db.users.set(user.id, structuredClone(user));
    },
  };
  // Restores the users table when fn throws, like the settings and audit tables.
  async function guarded<T>(tx: Parameters<Parameters<MemorySettingsDb["uow"]["transact"]>[0]>[0], fn: (tx: AuthTx) => Promise<T>): Promise<T> {
    const snapshot = structuredClone([...db.users]);
    try {
      return await fn({ ...tx, users: store });
    } catch (e) {
      db.users = new Map(snapshot);
      throw e;
    }
  }
  return db;
}
/** Deterministic fast hasher: `h:<pin>`. Never use outside tests. */
export const fakeHasher: PinHasher = {
  hash: async (pin) => `h:${pin}`,
  verify: async (pin, stored) => stored === `h:${pin}`,
};
/** Clock that tests can move. */
export function movableClock(startMs = Date.UTC(2026, 10, 19)): Clock & { set(ms: number): void; advance(ms: number): void } {
  let ms = startMs;
  return { now: () => new Date(ms), set: (v) => { ms = v; }, advance: (d) => { ms += d; } };
}
