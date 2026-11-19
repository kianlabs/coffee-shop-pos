import type { Tx } from "../ports";
import type { Role } from "@/domain/permissions";
/** One row of `users`. Lock state lives in `failedAttempts`, `lockedAt`, `lockedUntil` (epoch ms). */
export interface UserRecord {
  id: string;
  displayName: string;
  role: Role;
  pinHash: string;
  isActive: boolean;
  failedAttempts: number;
  lockedAt: number | null;
  lockedUntil: number | null;
  createdAt: string;
  updatedAt: string;
}
export interface UserStore {
  get(id: string): Promise<UserRecord | null>;
  /** Every user, active or not, ordered by creation then id. */
  list(): Promise<UserRecord[]>;
  /** Rejects when another active user has the same name ignoring case. */
  insert(user: UserRecord): Promise<void>;
  /** Replaces every column of the row. Rejects on an active-name clash. */
  update(user: UserRecord): Promise<void>;
}
/** PBKDF2 hashing behind a port so services do not import `src/data`. */
export interface PinHasher {
  hash(pin: string): Promise<string>;
  verify(pin: string, stored: string): Promise<boolean>;
}
/** Limits from settings `keamanan.*`. */
export interface SecurityLimits {
  nameMaxLength: number;
  pinMinLength: number;
  pinMaxLength: number;
  maxAttempts: number;
  lockMinutes: number;
  idleMinutes: number;
}
/** Settings and audit stores plus the users store, so user changes and audit rows commit together. */
export interface AuthTx extends Tx {
  users: UserStore;
}
export interface AuthUnitOfWork {
  transact<T>(fn: (tx: AuthTx) => Promise<T>): Promise<T>;
}
