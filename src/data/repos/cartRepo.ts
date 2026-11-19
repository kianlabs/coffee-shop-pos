import type { CartLine, CartState, CartStore, HeldOrderRecord, HeldOrderStore, OrderType } from "@/services/ports/shifts";
import type { DbPort } from "../dbPort";
import { writeInTx } from "../tx";
/** Single active cart row per device. */
const ACTIVE_CART_ID = "active";
const ORDER_TYPES: readonly string[] = ["dine_in", "takeaway", "delivery"];
const UPSERT_CART = `INSERT INTO carts (id, user_id, payload_json, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, payload_json = excluded.payload_json, updated_at = excluded.updated_at`;
const INSERT_HELD = "INSERT INTO held_orders (id, user_id, label, payload_json, held_at) VALUES (?, ?, ?, ?, ?)";
const HELD_COLUMNS = "id, user_id, label, payload_json, held_at";
type HeldRow = { id: string; user_id: string; label: string; payload_json: string; held_at: string };
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v : "");
/** Tolerant reader: rows imported from localStorage only carry `lines` and may lack the newer fields. */
export function parseCart(json: string): CartState {
  const raw: unknown = JSON.parse(json);
  const body = isRecord(raw) ? raw : {};
  const orderType = ORDER_TYPES.includes(text(body.orderType)) ? (body.orderType as OrderType) : "dine_in";
  const cart: CartState = {
    lines: Array.isArray(body.lines) ? (body.lines as CartLine[]) : [],
    orderType, tableNo: text(body.tableNo), customerName: text(body.customerName),
  };
  if (isRecord(body.orderDiscount)) cart.orderDiscount = body.orderDiscount as unknown as CartState["orderDiscount"];
  return cart;
}
async function defaultUserId(db: DbPort): Promise<string> {
  const opener = await db.query<{ opened_by: string }>("SELECT opened_by FROM shifts WHERE status = 'terbuka' LIMIT 1");
  if (opener[0]) return opener[0].opened_by;
  const users = await db.query<{ id: string }>("SELECT id FROM users WHERE is_active = 1 ORDER BY created_at, id LIMIT 1");
  if (users[0]) return users[0].id;
  throw new Error("Tidak ada pengguna aktif untuk menyimpan keranjang.");
}
/** CartStore over `carts`. Keeps one row; a leftover imported row is read once and replaced on the next save. */
export function createCartRepo(db: DbPort, cartUserId?: () => string | null): CartStore {
  return {
    async load() {
      const rows = await db.query<{ payload_json: string }>("SELECT payload_json FROM carts ORDER BY updated_at DESC, id LIMIT 1");
      return rows[0] ? parseCart(rows[0].payload_json) : null;
    },
    async save(cart) {
      const userId = cartUserId?.() ?? (await defaultUserId(db));
      await writeInTx(db, "DELETE FROM carts WHERE id <> ?", [ACTIVE_CART_ID]);
      await writeInTx(db, UPSERT_CART, [ACTIVE_CART_ID, userId, JSON.stringify(cart), new Date().toISOString()]);
    },
    clear: () => writeInTx(db, "DELETE FROM carts", []),
  };
}
const toHeld = (r: HeldRow): HeldOrderRecord => ({ id: r.id, label: r.label, heldBy: r.user_id, heldAt: r.held_at, cart: parseCart(r.payload_json) });
/** HeldOrderStore over `held_orders`, oldest first. */
export function createHeldOrderRepo(db: DbPort): HeldOrderStore {
  return {
    async list() {
      return (await db.query<HeldRow>(`SELECT ${HELD_COLUMNS} FROM held_orders ORDER BY held_at, rowid`)).map(toHeld);
    },
    async get(id) {
      const rows = await db.query<HeldRow>(`SELECT ${HELD_COLUMNS} FROM held_orders WHERE id = ?`, [id]);
      return rows[0] ? toHeld(rows[0]) : null;
    },
    insert: (o) => writeInTx(db, INSERT_HELD, [o.id, o.heldBy, o.label, JSON.stringify(o.cart), o.heldAt]),
    remove: (id) => writeInTx(db, "DELETE FROM held_orders WHERE id = ?", [id]),
  };
}
