import { INITIAL_LOCKOUT } from "@/domain/lockout";
import type { Role } from "@/domain/permissions";
import type { SecurityLimits, UserRecord } from "@/services/ports/users";
export const LIMITS: SecurityLimits = { nameMaxLength: 40, pinMinLength: 4, pinMaxLength: 6, maxAttempts: 3, lockMinutes: 5, idleMinutes: 10 };
export function user(id: string, role: Role, pin = "1234", extra: Partial<UserRecord> = {}): UserRecord {
  return {
    id, displayName: id, role, pinHash: `h:${pin}`, isActive: true, ...INITIAL_LOCKOUT,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...extra,
  };
}
