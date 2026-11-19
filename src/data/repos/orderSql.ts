import type { DbPort } from "../dbPort";
/** Rows changed by the previous write on this connection. */
export async function changes(db: DbPort): Promise<number> {
  const rows = await db.query<{ n: number }>("SELECT changes() AS n");
  return rows[0]?.n ?? 0;
}
/** True for a SQLite UNIQUE violation whose message names every given fragment. */
export function isUniqueViolation(e: unknown, ...fragments: string[]): boolean {
  if (!(e instanceof Error) && typeof e !== "string") return false;
  const message = e instanceof Error ? e.message : e;
  return message.includes("UNIQUE constraint failed") && fragments.every((f) => message.includes(f));
}
/**
 * Runs a write and turns the named unique violation into the same error the
 * in-memory store throws; any other error passes through unchanged.
 */
export async function mapDuplicate(write: () => Promise<void>, fragments: string[], message: string): Promise<void> {
  try {
    await write();
  } catch (e) {
    if (isUniqueViolation(e, ...fragments)) throw new Error(message, { cause: e });
    throw e;
  }
}
/** Line facts that have no column of their own (see UPGRADE_V12); kept in `order_items.hpp_detail_json`. */
export interface LineMeta {
  key: string;
  adjustmentsRp: number;
}
export function parseLineMeta(raw: string | null): LineMeta {
  const fallback: LineMeta = { key: "", adjustmentsRp: 0 };
  if (raw === null) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return fallback;
    const { key, adjustmentsRp } = value as Record<string, unknown>;
    return {
      key: typeof key === "string" ? key : "",
      adjustmentsRp: typeof adjustmentsRp === "number" ? adjustmentsRp : 0,
    };
  } catch {
    return fallback;
  }
}
