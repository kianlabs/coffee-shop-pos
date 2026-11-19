import type { DbPort } from "@/data/dbPort";
import type { DataHook } from "@/data/migration/runner";
import type { HookInputs, LegacyKey } from "./inputs";
import { contentHash, parseJson, toCartLine, toHeld, toShift, type LegacyHeld } from "./legacyParse";
import { migrationUserId } from "./migrationUser";
type GetUser = () => Promise<string>;
type Importer = (db: DbPort, getUser: GetUser, inputs: HookInputs) => Promise<boolean>;
async function importShift(db: DbPort, getUser: GetUser, inputs: HookInputs): Promise<boolean> {
  const raw = parseJson(inputs.legacy.shift);
  if (raw === undefined) {
    if (inputs.legacy.shift !== null) inputs.log?.("pos.shift.v1 rusak, dilewati.");
    return false;
  }
  const shift = toShift(raw);
  if (shift === null) {
    inputs.log?.("pos.shift.v1 tidak valid, dilewati.");
    return false;
  }
  const userId = await getUser();
  const closed = shift.closedAt !== null;
  await db.run(
    `INSERT OR IGNORE INTO shifts (id, opened_by, opened_at, opening_cash_rp, status, closed_by, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [shift.id, userId, shift.openedAt, shift.openCashRp, closed ? "ditutup" : "terbuka", closed ? userId : null, shift.closedAt],
  );
  return true;
}
async function importCart(db: DbPort, getUser: GetUser, inputs: HookInputs): Promise<boolean> {
  const raw = parseJson(inputs.legacy.cart);
  if (!Array.isArray(raw)) {
    if (inputs.legacy.cart !== null) inputs.log?.("pos.cart.v1 rusak, dilewati.");
    return false;
  }
  const lines = raw.map(toCartLine).filter((l) => l !== null);
  if (lines.length < raw.length) inputs.log?.(`pos.cart.v1: ${raw.length - lines.length} baris rusak dilewati.`);
  if (lines.length === 0) return false;
  const userId = await getUser();
  await db.run("INSERT OR IGNORE INTO carts (id, user_id, payload_json, updated_at) VALUES (?, ?, ?, ?)", [
    `legacy-cart-${userId}`, userId, JSON.stringify({ lines }), inputs.now(),
  ]);
  return true;
}
function heldLabel(held: LegacyHeld, index: number): string {
  const note = held.notes.trim().slice(0, 100);
  return note === "" ? `Pesanan ${index + 1}` : note;
}
async function importHeld(db: DbPort, getUser: GetUser, inputs: HookInputs): Promise<boolean> {
  const raw = parseJson(inputs.legacy.held);
  if (!Array.isArray(raw)) {
    if (inputs.legacy.held !== null) inputs.log?.("pos_held_orders rusak, dilewati.");
    return false;
  }
  for (const [index, entry] of raw.entries()) {
    const held = toHeld(entry);
    if (held === null) {
      inputs.log?.(`pos_held_orders[${index}] rusak, dilewati.`);
      continue;
    }
    const userId = await getUser();
    const { lines, notes, orderType, discount, tax, total, heldAt } = held;
    const body = JSON.stringify({ lines, notes, orderType, discount, tax, total });
    await db.run("INSERT OR IGNORE INTO held_orders (id, user_id, label, payload_json, held_at) VALUES (?, ?, ?, ?, ?)", [
      `legacy-held-${index}-${contentHash(`${held.id}|${body}`)}`, userId, heldLabel(held, index), body, heldAt ?? inputs.now(),
    ]);
  }
  return true;
}
const IMPORTERS: Array<[LegacyKey, Importer]> = [["shift", importShift], ["cart", importCart], ["held", importHeld]];
/**
 * Moves shift, cart and held orders from localStorage JSON into SQLite. Ids are deterministic and
 * every write is INSERT OR IGNORE, so running twice creates no duplicates. Corrupt entries are skipped and logged.
 */
export function createLegacyCartShiftHook(inputs: HookInputs, onImported: (key: LegacyKey) => void): DataHook {
  return async (db) => {
    const present = IMPORTERS.filter(([key]) => inputs.legacy[key] !== null);
    if (present.length === 0) return;
    let userId: Promise<string> | null = null;
    const getUser: GetUser = () => (userId ??= migrationUserId(db, inputs.now()));
    for (const [key, importer] of present) {
      if (await importer(db, getUser, inputs)) onImported(key);
    }
  };
}
