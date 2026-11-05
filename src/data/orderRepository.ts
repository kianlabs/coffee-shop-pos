import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { createCompletedOrder, validateCheckout, type CheckoutInput, type Order } from "../domain/orders";
import { getDb } from "./db";
import {
  STOCK_DEDUCTION_ENABLED,
  prepareConsumption,
  prepareVoidReversal,
  v2TablesExist,
  type ConsumptionPlan,
} from "./stock";
import { getSettings } from "./settings";
import { hppKey, resolveCheckoutHpp, type CheckoutHpp } from "./productRepo";

export type { BackupRecord } from "./orderStore";
export { downloadBackup, listBackups } from "./orderStore";

const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const MAX_BACKUP_ORDERS = 50000;

type OrderRow = {
  id: string;
  receipt_number: string;
  idempotency_key: string;
  status: Order["status"];
  subtotal_rp: number;
  discount_rp: number;
  tax_rp: number;
  service_charge_rp: number | null;
  rounding_rp: number | null;
  total_rp: number;
  notes: string | null;
  created_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name_snapshot: string;
  variant_name_snapshot: string | null;
  quantity: number;
  unit_price_rp: number;
  line_total_rp: number;
  created_at: string;
};

type PaymentRow = {
  id: string;
  order_id: string;
  method: Order["payment"]["method"];
  amount_rp: number;
  status: string;
  paid_at: string | null;
  created_at: string;
};

function rowValues(res: { values?: unknown[] }): unknown[] {
  return Array.isArray(res.values) ? res.values : [];
}

function toOrder(
  row: OrderRow,
  items: OrderItemRow[],
  payment: PaymentRow | undefined,
): Order {
  const change = payment ? payment.amount_rp - row.total_rp : 0;
  return {
    id: row.id,
    receiptNumber: row.receipt_number,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    lines: items.map((i) => ({
      productId: i.product_id ?? "",
      variantId: i.variant_id,
      productName: i.product_name_snapshot,
      variantName: i.variant_name_snapshot,
      unitPriceRp: i.unit_price_rp,
      qty: i.quantity,
      lineTotalRp: i.line_total_rp,
    })),
    subtotalRp: row.subtotal_rp,
    discountRp: row.discount_rp,
    taxRp: row.tax_rp,
    serviceChargeRp: row.service_charge_rp ?? 0,
    roundingRp: row.rounding_rp ?? 0,
    totalRp: row.total_rp,
    payment: {
      method: payment?.method ?? "cash",
      amountRp: payment?.amount_rp ?? row.total_rp,
      paidAt: payment?.paid_at ?? row.created_at,
    },
    changeRp: change < 0 ? 0 : change,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

async function hydrateOne(db: SQLiteDBConnection, row: OrderRow): Promise<Order> {
  const itemRes = await db.query(
    "SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at ASC;",
    [row.id],
  );
  const payRes = await db.query("SELECT * FROM payments WHERE order_id = ?;", [row.id]);
  const items = rowValues(itemRes) as OrderItemRow[];
  const pays = rowValues(payRes) as PaymentRow[];
  return toOrder(row, items, pays[0]);
}

async function loadOrderById(db: SQLiteDBConnection, id: string): Promise<Order | null> {
  const res = await db.query("SELECT * FROM orders WHERE id = ?;", [id]);
  const rows = rowValues(res) as OrderRow[];
  if (rows.length === 0) {
    return null;
  }
  return hydrateOne(db, rows[0]);
}

async function loadOrderByKey(db: SQLiteDBConnection, key: string): Promise<Order | null> {
  const res = await db.query("SELECT * FROM orders WHERE idempotency_key = ?;", [key]);
  const rows = rowValues(res) as OrderRow[];
  if (rows.length === 0) {
    return null;
  }
  return hydrateOne(db, rows[0]);
}

async function loadAllOrders(db: SQLiteDBConnection, limit?: number): Promise<Order[]> {
  // Tanpa `limit` = ambil semua. Sebelumnya default 200 membuat backup dan
  // rekap shift terpotong diam-diam (Number.isFinite(Infinity) === false).
  const capped =
    typeof limit === "number" && Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : Number.POSITIVE_INFINITY;
  const orderRowsAll = (await db.query("SELECT * FROM orders ORDER BY created_at DESC;")).values;
  const orderRows = (Array.isArray(orderRowsAll) ? orderRowsAll : []).slice(0, capped) as OrderRow[];
  if (orderRows.length === 0) {
    return [];
  }
  const wanted = new Set(orderRows.map((o) => o.id));
  const itemRowsAll = (await db.query("SELECT * FROM order_items ORDER BY created_at ASC;")).values;
  const payRowsAll = (await db.query("SELECT * FROM payments;")).values;
  const itemRows = ((Array.isArray(itemRowsAll) ? itemRowsAll : []) as OrderItemRow[]).filter((r) => wanted.has(r.order_id));
  const payRows = ((Array.isArray(payRowsAll) ? payRowsAll : []) as PaymentRow[]).filter((r) => wanted.has(r.order_id));
  const itemsByOrder = new Map<string, OrderItemRow[]>();
  for (const i of itemRows) {
    const list = itemsByOrder.get(i.order_id) ?? [];
    list.push(i);
    itemsByOrder.set(i.order_id, list);
  }
  const payByOrder = new Map<string, PaymentRow>();
  for (const p of payRows) {
    if (!payByOrder.has(p.order_id)) {
      payByOrder.set(p.order_id, p);
    }
  }
  return orderRows.map((o) => toOrder(o, itemsByOrder.get(o.id) ?? [], payByOrder.get(o.id)));
}

function isUniqueViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /unique constraint failed|unique/i.test(msg);
}

function uniqueConstraintTarget(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/UNIQUE constraint failed:\s*([^\s;]+)/i);
  return m ? m[1].toLowerCase() : "";
}

export async function loadOrdersAsync(limit = 200): Promise<Order[]> {
  const db = await getDb();
  return loadAllOrders(db, limit);
}

/** Semua order, tanpa cap — untuk rekap shift dan backup. */
export async function loadAllOrdersAsync(): Promise<Order[]> {
  const db = await getDb();
  return loadAllOrders(db);
}

export async function checkoutAtomicAsync(
  input: CheckoutInput,
): Promise<{ order: Order; duplicate: boolean }> {
  const error = validateCheckout(input);
  if (error) {
    throw new Error(error);
  }
  const db = await getDb();
  const existing = await db.query("SELECT id FROM orders WHERE idempotency_key = ?;", [
    input.idempotencyKey,
  ]);
  const existingRows = rowValues(existing) as { id: string }[];
  if (existingRows[0]?.id) {
    const found = await loadOrderById(db, existingRows[0].id);
    if (found) {
      return { order: found, duplicate: true };
    }
  }
  const order = createCompletedOrder(input, new Date());
  const now = order.createdAt;
  const itemIds = order.lines.map((_, idx) => `${order.id}-item-${idx}`);

  // Snapshot HPP per baris: manual (diisi user), resep (dihitung dari bahan),
  // atau none. Kegagalan resolusi tidak boleh menggagalkan penjualan —
  // dicatat sebagai source 'none' + alasan di detail_json.
  let hppMap = new Map<string, CheckoutHpp>();
  try {
    hppMap = await resolveCheckoutHpp(db, order.lines);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "gagal membaca konfigurasi HPP";
    for (const l of order.lines) {
      hppMap.set(hppKey(l.productId, l.variantId), {
        unitHppRp: 0,
        source: "none",
        recipeVersion: null,
        detailJson: JSON.stringify({ error: reason }),
      });
    }
  }

  // Konsumsi stok dibangun SEKARANG dan dieksekusi di transaksi yang sama
  // dengan order. Order, stok, movement, dan snapshot HPP jadi atomik.
  let consumption: ConsumptionPlan = { statements: [], byItem: new Map(), negative: [] };
  if (STOCK_DEDUCTION_ENABLED) {
    try {
      if (await v2TablesExist(db)) {
        consumption = await prepareConsumption(
          db,
          order.id,
          order.lines.map((l, idx) => ({
            orderItemId: itemIds[idx],
            productId: l.productId,
            variantId: l.variantId,
            qty: l.qty,
          })),
          now,
          null,
        );
      }
    } catch {
      consumption = { statements: [], byItem: new Map(), negative: [] };
    }
  }

  if (consumption.negative.length > 0 && getSettings().blockNegativeStock) {
    const detail = consumption.negative.map((n) => `${n.name} (sisa ${n.after})`).join(", ");
    throw new Error(`Stok tidak cukup: ${detail}.`);
  }

  const txn: { statement: string; values?: unknown[] }[] = [
    {
      statement:
        "INSERT INTO orders (id, receipt_number, idempotency_key, status, subtotal_rp, discount_rp, tax_rp, service_charge_rp, rounding_rp, total_rp, notes, created_at, updated_at) VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      values: [
        order.id,
        order.receiptNumber,
        order.idempotencyKey,
        order.subtotalRp,
        order.discountRp,
        order.taxRp,
        order.serviceChargeRp,
        order.roundingRp,
        order.totalRp,
        order.notes,
        now,
        now,
      ],
    },
    ...order.lines.flatMap((l, idx) => {
      const itemId = itemIds[idx];
      const base = hppMap.get(hppKey(l.productId, l.variantId)) ?? {
        unitHppRp: 0,
        source: "none" as const,
        recipeVersion: null,
        detailJson: null,
      };
      const fromRecipe = consumption.byItem.get(itemId);
      const hpp =
        base.source === "recipe" && fromRecipe
          ? {
              unitHppRp: fromRecipe.hppUnitRp,
              source: "recipe" as const,
              recipeVersion: fromRecipe.recipeVersion,
              detailJson: fromRecipe.detailJson,
            }
          : base;
      const hppTotalRp = hpp.unitHppRp * l.qty;
      return [
        {
          statement:
            "INSERT INTO order_items (id, order_id, product_id, variant_id, product_name_snapshot, variant_name_snapshot, quantity, unit_price_rp, discount_rp, line_total_rp, hpp_total_rp, recipe_version_snapshot, created_at, hpp_unit_rp, hpp_source, hpp_detail_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?);",
          values: [
            itemId,
            order.id,
            l.productId || null,
            l.variantId,
            l.productName,
            l.variantName,
            l.qty,
            l.unitPriceRp,
            l.lineTotalRp,
            hppTotalRp,
            hpp.recipeVersion,
            now,
            hpp.unitHppRp,
            hpp.source,
            hpp.detailJson,
          ],
        },
      ];
    }),
    ...consumption.statements,
    {
      statement:
        "INSERT INTO payments (id, order_id, method, amount_rp, status, reference_note, paid_at, created_at) VALUES (?, ?, ?, ?, 'paid', NULL, ?, ?);",
      values: [`${order.id}-pay`, order.id, order.payment.method, order.payment.amountRp, order.payment.paidAt, now],
    },
    {
      statement:
        "INSERT INTO sync_outbox (id, event_type, aggregate_type, aggregate_id, payload_json, schema_version, status, attempt_count, next_attempt_at, last_error, created_at, acknowledged_at) VALUES (?, 'order.completed', 'order', ?, ?, 1, 'pending', 0, NULL, NULL, ?, NULL);",
      values: [`${order.id}-evt`, order.id, JSON.stringify({ orderId: order.id, totalRp: order.totalRp, serviceChargeRp: order.serviceChargeRp, roundingRp: order.roundingRp }), now],
    },
    {
      statement:
        "INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, before_json, after_json, reason, created_at) VALUES (?, NULL, 'order.completed', 'order', ?, NULL, ?, NULL, ?);",
      values: [
        `${order.id}-audit`,
        order.id,
        JSON.stringify({
          totalRp: order.totalRp,
          stockShortage: consumption.negative.length > 0 ? consumption.negative : undefined,
        }),
        now,
      ],
    },
  ];
  try {
    await db.executeTransaction(txn, false);
  } catch (e) {
    if (isUniqueViolation(e)) {
      const winner = await loadOrderByKey(db, order.idempotencyKey);
      if (winner) {
        return { order: winner, duplicate: true };
      }
      if (uniqueConstraintTarget(e).includes("receipt_number")) {
        throw new Error("Nomor struk duplikat, coba lagi.");
      }
    }
    throw e;
  }
  return { order, duplicate: false };
}

async function tableSqlAllows(db: SQLiteDBConnection, table: string, value: string): Promise<boolean> {
  try {
    const res = await db.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?;", [
      table,
    ]);
    const row = (rowValues(res) as { sql?: string }[])[0];
    return typeof row?.sql === "string" && row.sql.includes(`'${value}'`);
  } catch {
    return false;
  }
}

export async function voidOrderAsync(orderId: string): Promise<Order[]> {
  const db = await getDb();
  const current = await loadOrderById(db, orderId);
  if (!current || current.status !== "completed") {
    throw new Error("Order tidak bisa di-void.");
  }
  const now = new Date().toISOString();
  const txn: { statement: string; values?: unknown[] }[] = [
    {
      statement: "UPDATE orders SET status = 'voided', updated_at = ? WHERE id = ?;",
      values: [now, orderId],
    },
    {
      statement:
        "INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, before_json, after_json, reason, created_at) VALUES (?, NULL, 'order.voided', 'order', ?, NULL, ?, NULL, ?);",
      values: [`${orderId}-void-${Date.now()}`, orderId, JSON.stringify({ orderId }), now],
    },
    {
      statement:
        "INSERT INTO sync_outbox (id, event_type, aggregate_type, aggregate_id, payload_json, schema_version, status, attempt_count, next_attempt_at, last_error, created_at, acknowledged_at) VALUES (?, 'order.voided', 'order', ?, ?, 1, 'pending', 0, NULL, NULL, ?, NULL);",
      values: [`${orderId}-void-evt`, orderId, JSON.stringify({ orderId }), now],
    },
  ];
  if (await tableSqlAllows(db, "payments", "voided")) {
    txn.push({
      statement: "UPDATE payments SET status = 'voided' WHERE order_id = ?;",
      values: [orderId],
    });
  }
  // Void = kebalikan penuh: stok yang sudah terpotong dikembalikan lewat
  // movement `return_in` di transaksi yang sama.
  if (STOCK_DEDUCTION_ENABLED) {
    try {
      if (await v2TablesExist(db)) {
        const reversal = await prepareVoidReversal(db, orderId, now, null);
        txn.push(...reversal.statements);
      }
    } catch {
      // Tabel V2 belum ada: void tetap jalan tanpa reversal stok.
    }
  }
  await db.executeTransaction(txn, false);
  return loadAllOrders(db);
}

export async function exportBackupJsonAsync(): Promise<string> {
  const db = await getDb();
  const orders = await loadAllOrders(db);
  return JSON.stringify(
    { schemaVersion: 1, exportedAt: new Date().toISOString(), orders },
    null,
    2,
  );
}

function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

function isParseableDate(s: unknown): s is string {
  return typeof s === "string" && s.length > 0 && !Number.isNaN(Date.parse(s));
}

function isCappedString(s: unknown, max: number, allowEmpty = false): s is string {
  return typeof s === "string" && s.length <= max && (allowEmpty || s.length > 0);
}

function validateBackupOrders(orders: Order[]): void {
  const fail = (reason: string): never => {
    throw new Error(`Data backup tidak valid: ${reason}`);
  };
  for (const o of orders) {
    if (!o || typeof o !== "object") {
      fail("order bukan objek.");
    }
    if (!isCappedString(o.id, 128) || !isCappedString(o.idempotencyKey, 128) || !isCappedString(o.receiptNumber, 128)) {
      fail("id/idempotencyKey/receiptNumber wajib string non-kosong ≤128 karakter.");
    }
    if (o.status !== "completed" && o.status !== "voided" && o.status !== "refunded") {
      fail(`status order ${o.id} tidak valid.`);
    }
    if (!Array.isArray(o.lines) || o.lines.length === 0) {
      fail(`order ${o.id} wajib punya ≥1 line.`);
    }
    let lineSum = 0;
    for (const l of o.lines) {
      if (!l || typeof l !== "object") {
        fail(`line order ${o.id} bukan objek.`);
      }
      if (typeof l.productName !== "string" || l.productName.length === 0 || l.productName.length > 200) {
        fail(`productName order ${o.id} wajib non-kosong ≤200 karakter.`);
      }
      if (!isInt(l.qty) || l.qty <= 0) {
        fail(`qty order ${o.id} wajib integer > 0.`);
      }
      if (!isInt(l.unitPriceRp) || l.unitPriceRp < 0) {
        fail(`unitPriceRp order ${o.id} wajib integer ≥ 0.`);
      }
      if (l.lineTotalRp !== l.unitPriceRp * l.qty) {
        fail(`lineTotalRp order ${o.id} tidak konsisten (unitPrice×qty).`);
      }
      lineSum += l.lineTotalRp;
    }
    if (o.subtotalRp !== lineSum) {
      fail(`subtotalRp order ${o.id} tidak sama dengan Σ lineTotalRp.`);
    }
    const svc = (o.serviceChargeRp ?? 0) as number;
    const rnd = (o.roundingRp ?? 0) as number;
    if (!isInt(svc) || svc < 0) {
      fail(`serviceChargeRp order ${o.id} wajib integer ≥ 0.`);
    }
    if (!isInt(rnd) || rnd > 0) {
      fail(`roundingRp order ${o.id} wajib integer ≤ 0.`);
    }
    if (o.discountRp > o.subtotalRp) {
      fail(`discountRp order ${o.id} melebihi subtotal.`);
    }
    if (!isInt(o.totalRp) || o.totalRp < 0 || o.totalRp !== o.subtotalRp - o.discountRp + o.taxRp + svc + rnd) {
      fail(`totalRp order ${o.id} tidak sama dengan subtotal-discount+tax+layanan+rounding.`);
    }
    const p = o.payment;
    if (!p || typeof p !== "object") {
      fail(`payment order ${o.id} wajib ada.`);
    }
    if (p.method !== "cash" && p.method !== "qris_manual" && p.method !== "other") {
      fail(`payment.method order ${o.id} tidak valid.`);
    }
    if (!isInt(p.amountRp) || p.amountRp < 0 || p.amountRp < o.totalRp) {
      fail(`payment.amountRp order ${o.id} wajib integer ≥ totalRp.`);
    }
    if (o.changeRp !== p.amountRp - o.totalRp) {
      fail(`changeRp order ${o.id} tidak sama dengan amount-total.`);
    }
    if (!isParseableDate(p.paidAt)) {
      fail(`payment.paidAt order ${o.id} tidak valid.`);
    }
    if (!isParseableDate(o.createdAt)) {
      fail(`createdAt order ${o.id} tidak valid.`);
    }
    if (o.notes !== null && o.notes !== undefined) {
      if (typeof o.notes !== "string" || o.notes.length > 1000) {
        fail(`notes order ${o.id} maksimal 1000 karakter.`);
      }
    }
  }
}

export async function importBackupJsonAsync(json: string): Promise<number> {
  if (json.length > MAX_BACKUP_BYTES) {
    throw new Error("File backup terlalu besar.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Format backup tidak valid.");
  }
  const env = parsed as { schemaVersion?: unknown; orders?: unknown };
  if (!env || typeof env !== "object" || env.schemaVersion !== 1 || !Array.isArray(env.orders)) {
    throw new Error("Format backup tidak valid.");
  }
  if (env.orders.length > MAX_BACKUP_ORDERS) {
    throw new Error("File backup terlalu besar.");
  }
  const orders = env.orders as Order[];
  validateBackupOrders(orders);
  const db = await getDb();
  const txn: { statement: string; values?: unknown[] }[] = [
    // Anak terdalam dulu. `order_item_cost_snapshots.order_item_id` punya FK ke
    // order_items; tanpa baris ini restore selalu gagal "FOREIGN KEY constraint
    // failed" begitu ada satu order yang memakai resep.
    { statement: "DELETE FROM order_item_cost_snapshots;" },
    { statement: "DELETE FROM payments;" },
    { statement: "DELETE FROM order_items;" },
    { statement: "DELETE FROM sync_outbox;" },
    { statement: "DELETE FROM orders;" },
  ];
  for (const o of orders) {
    txn.push({
      statement:
        "INSERT INTO orders (id, receipt_number, idempotency_key, status, subtotal_rp, discount_rp, tax_rp, service_charge_rp, rounding_rp, total_rp, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      values: [o.id, o.receiptNumber, o.idempotencyKey, o.status, o.subtotalRp, o.discountRp, o.taxRp, (o.serviceChargeRp ?? 0), (o.roundingRp ?? 0), o.totalRp, o.notes, o.createdAt, o.createdAt],
    });
    o.lines.forEach((l, idx) => {
      txn.push({
        statement:
          "INSERT INTO order_items (id, order_id, product_id, variant_id, product_name_snapshot, variant_name_snapshot, quantity, unit_price_rp, discount_rp, line_total_rp, hpp_total_rp, recipe_version_snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, NULL, ?);",
        values: [`${o.id}-item-${idx}`, o.id, l.productId || null, l.variantId, l.productName, l.variantName, l.qty, l.unitPriceRp, l.lineTotalRp, o.createdAt],
      });
    });
    txn.push({
      statement:
        "INSERT INTO payments (id, order_id, method, amount_rp, status, reference_note, paid_at, created_at) VALUES (?, ?, ?, ?, 'paid', NULL, ?, ?);",
      values: [`${o.id}-pay`, o.id, o.payment.method, o.payment.amountRp, o.payment.paidAt, o.createdAt],
    });
    if (o.status === "completed") {
      txn.push({
        statement:
          "INSERT INTO sync_outbox (id, event_type, aggregate_type, aggregate_id, payload_json, schema_version, status, attempt_count, next_attempt_at, last_error, created_at, acknowledged_at) VALUES (?, 'order.completed', 'order', ?, ?, 1, 'pending', 0, NULL, NULL, ?, NULL);",
        values: [`${o.id}-evt`, o.id, JSON.stringify({ orderId: o.id, totalRp: o.totalRp }), o.createdAt],
      });
    } else if (o.status === "voided") {
      // Order void juga harus sampai ke cloud, kalau tidak server menganggapnya
      // penjualan sah selamanya.
      txn.push({
        statement:
          "INSERT INTO sync_outbox (id, event_type, aggregate_type, aggregate_id, payload_json, schema_version, status, attempt_count, next_attempt_at, last_error, created_at, acknowledged_at) VALUES (?, 'order.voided', 'order', ?, ?, 1, 'pending', 0, NULL, NULL, ?, NULL);",
        values: [`${o.id}-void-evt`, o.id, JSON.stringify({ orderId: o.id }), o.createdAt],
      });
    }
  }
  txn.push({
    statement:
      "INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, before_json, after_json, reason, created_at) VALUES (?, NULL, 'backup.restored', 'backup', 'backup', NULL, ?, NULL, ?);",
    values: [
      `restore-${Date.now()}`,
      JSON.stringify({ count: orders.length }),
      new Date().toISOString(),
    ],
  });
  await db.executeTransaction(txn, false);
  return orders.length;
}
