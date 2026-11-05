import { createCompletedOrder, validateCheckout, type CheckoutInput, type Order } from "../domain/orders";

const ORDERS_KEY = "pos.orders.v1";
const BACKUP_INDEX_KEY = "pos.backups.v1";
const VOID_AUDIT_KEY = "pos.void-audit.v1";

const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const MAX_BACKUP_ORDERS = 50000;
const MAX_ID_LEN = 128;
const MAX_NAME_LEN = 200;
const MAX_NOTES_LEN = 1000;
const MAX_VOID_AUDIT_ENTRIES = 500;

const ORDER_STATUSES: readonly string[] = ["completed", "voided", "refunded"];
const PAYMENT_METHODS: readonly string[] = ["cash", "qris_manual", "other"];

type StoreShape = {
  schemaVersion: 1;
  orders: Order[];
};

export type BackupRecord = {
  name: string;
  createdAt: string;
  orderCount: number;
};

export type VoidAuditEntry = {
  orderId: string;
  voidedAt: string;
};

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function isQuotaError(e: unknown): boolean {
  if (e instanceof DOMException) {
    return e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED";
  }
  if (typeof e === "object" && e !== null && "code" in e) {
    return e.code === 22;
  }
  return false;
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (isQuotaError(e)) {
      throw new Error("Penyimpanan penuh.");
    }
    throw e;
  }
}

export function loadOrders(): Order[] {
  const raw = readRaw(ORDERS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return [];
    }
    if (!("schemaVersion" in parsed) || !("orders" in parsed)) {
      return [];
    }
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.orders)) {
      return [];
    }
    // Shape dasar terverifikasi (versi + array); item divalidasi saat dipakai.
    return parsed.orders as Order[];
  } catch {
    return [];
  }
}

function saveOrders(orders: Order[]): void {
  if (!Array.isArray(orders)) {
    throw new Error("Data order tidak valid.");
  }
  const shape: StoreShape = { schemaVersion: 1, orders };
  writeRaw(ORDERS_KEY, JSON.stringify(shape));
}

export function checkoutAtomic(input: CheckoutInput): { order: Order; duplicate: boolean } {
  const error = validateCheckout(input);
  if (error) {
    throw new Error(error);
  }
  const orders = loadOrders();
  const existing = orders.find((o) => o.idempotencyKey === input.idempotencyKey);
  if (existing) {
    return { order: existing, duplicate: true };
  }
  const order = createCompletedOrder(input, new Date());
  saveOrders([order, ...orders]);
  return { order, duplicate: false };
}

function appendVoidAudit(entry: VoidAuditEntry): void {
  try {
    const raw = readRaw(VOID_AUDIT_KEY);
    let entries: VoidAuditEntry[] = [];
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        entries = parsed as VoidAuditEntry[];
      }
    }
    writeRaw(VOID_AUDIT_KEY, JSON.stringify([...entries, entry].slice(-MAX_VOID_AUDIT_ENTRIES)));
  } catch {
    // Best-effort: void sudah tersimpan, audit boleh gagal dicatat.
  }
}

export function listVoidAudit(): VoidAuditEntry[] {
  const raw = readRaw(VOID_AUDIT_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VoidAuditEntry[]) : [];
  } catch {
    return [];
  }
}

export function voidOrder(orderId: string): Order[] {
  const orders = loadOrders();
  const target = orders.find((o) => o.id === orderId);
  if (!target) {
    throw new Error("Order tidak ditemukan.");
  }
  if (target.status !== "completed") {
    throw new Error(`Order ${target.receiptNumber} tidak dapat dibatalkan (status: ${target.status}).`);
  }
  const next = orders.map((o) =>
    o.id === orderId ? { ...o, status: "voided" as const } : o,
  );
  saveOrders(next);
  appendVoidAudit({ orderId, voidedAt: new Date().toISOString() });
  return next;
}

export function refund(orderId: string): Order[] {
  const orders = loadOrders();
  const target = orders.find((o) => o.id === orderId);
  if (!target) {
    throw new Error("Order sudah di-void/refund atau tidak ditemukan.");
  }
  if (target.status !== "completed") {
    throw new Error("Order sudah di-void/refund atau tidak ditemukan.");
  }
  const next = orders.map((o) =>
    o.id === orderId ? { ...o, status: "refunded" as const } : o,
  );
  saveOrders(next);
  return next;
}

export const refundOrder = refund;

export function exportBackupJson(): string {
  return JSON.stringify(
    { schemaVersion: 1, exportedAt: new Date().toISOString(), orders: loadOrders() },
    null,
    2,
  );
}

function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

function isNonEmptyString(s: unknown, max: number): s is string {
  return typeof s === "string" && s.length > 0 && s.length <= max;
}

function isParseableDate(s: unknown): s is string {
  return typeof s === "string" && !Number.isNaN(Date.parse(s));
}

function validateBackupLine(item: unknown, label: string): number | string {
  if (typeof item !== "object" || item === null) {
    return `Item tidak valid pada order ${label}.`;
  }
  if (!("productName" in item) || !isNonEmptyString(item.productName, MAX_NAME_LEN)) {
    return `Nama produk tidak valid pada order ${label}.`;
  }
  if (!("productId" in item) || typeof item.productId !== "string" || item.productId.length > MAX_ID_LEN) {
    return `ID produk tidak valid pada order ${label}.`;
  }
  if (!("variantId" in item) || (item.variantId !== null && (typeof item.variantId !== "string" || item.variantId.length > MAX_ID_LEN))) {
    return `ID varian tidak valid pada order ${label}.`;
  }
  if (!("variantName" in item) || (item.variantName !== null && (typeof item.variantName !== "string" || item.variantName.length > MAX_NAME_LEN))) {
    return `Nama varian tidak valid pada order ${label}.`;
  }
  if (!("qty" in item) || !isInt(item.qty) || item.qty <= 0) {
    return `Qty tidak valid pada order ${label}.`;
  }
  if (!("unitPriceRp" in item) || !isInt(item.unitPriceRp) || item.unitPriceRp < 0) {
    return `Harga tidak valid pada order ${label}.`;
  }
  if (!("lineTotalRp" in item) || item.lineTotalRp !== item.unitPriceRp * item.qty) {
    return `Total baris tidak sesuai pada order ${label}.`;
  }
  return item.unitPriceRp * item.qty;
}

function validateBackupOrder(o: unknown): string | null {
  if (typeof o !== "object" || o === null) {
    return "Data order tidak valid pada backup.";
  }
  if (!("id" in o) || !isNonEmptyString(o.id, MAX_ID_LEN)) {
    return "ID order tidak valid pada backup.";
  }
  const label = typeof o.id === "string" ? o.id : "order";
  if (!("receiptNumber" in o) || !isNonEmptyString(o.receiptNumber, MAX_ID_LEN)) {
    return `Nomor struk tidak valid pada order ${label}.`;
  }
  if (!("idempotencyKey" in o) || !isNonEmptyString(o.idempotencyKey, MAX_ID_LEN)) {
    return `Idempotency key tidak valid pada order ${label}.`;
  }
  if (!("status" in o) || typeof o.status !== "string" || !ORDER_STATUSES.includes(o.status)) {
    return `Status tidak valid pada order ${label}.`;
  }
  if (!("lines" in o) || !Array.isArray(o.lines) || o.lines.length === 0) {
    return `Order ${label} tidak memiliki item.`;
  }
  let subtotal = 0;
  for (const item of o.lines) {
    const lineTotal = validateBackupLine(item, label);
    if (typeof lineTotal === "string") {
      return lineTotal;
    }
    subtotal += lineTotal;
  }
  const svc = "serviceChargeRp" in o && typeof o.serviceChargeRp === "number" ? o.serviceChargeRp : 0;
  const rnd = "roundingRp" in o && typeof o.roundingRp === "number" ? o.roundingRp : 0;
  if (!isInt(svc) || svc < 0) {
    return `Biaya layanan tidak valid pada order ${label}.`;
  }
  if (!isInt(rnd) || rnd > 0) {
    return `Pembulatan tidak valid pada order ${label}.`;
  }
  if (!("subtotalRp" in o) || !isInt(o.subtotalRp) || o.subtotalRp < 0) {
    return `Nominal subtotalRp tidak valid pada order ${label}.`;
  }
  if (!("discountRp" in o) || !isInt(o.discountRp) || o.discountRp < 0) {
    return `Nominal discountRp tidak valid pada order ${label}.`;
  }
  if (!("taxRp" in o) || !isInt(o.taxRp) || o.taxRp < 0) {
    return `Nominal taxRp tidak valid pada order ${label}.`;
  }
  if (!("totalRp" in o) || !isInt(o.totalRp) || o.totalRp < 0) {
    return `Nominal totalRp tidak valid pada order ${label}.`;
  }
  if (o.subtotalRp !== subtotal) {
    return `Subtotal tidak sesuai pada order ${label}.`;
  }
  if (o.discountRp > o.subtotalRp) {
    return `Diskon melebihi subtotal pada order ${label}.`;
  }
  if (o.totalRp !== o.subtotalRp - o.discountRp + o.taxRp + svc + rnd) {
    return `Total tidak sesuai pada order ${label}.`;
  }
  if (!("payment" in o) || typeof o.payment !== "object" || o.payment === null) {
    return `Pembayaran tidak valid pada order ${label}.`;
  }
  const payment = o.payment;
  if (!("method" in payment) || typeof payment.method !== "string" || !PAYMENT_METHODS.includes(payment.method)) {
    return `Metode bayar tidak valid pada order ${label}.`;
  }
  if (!("amountRp" in payment) || !isInt(payment.amountRp) || payment.amountRp < 0) {
    return `Nominal bayar tidak valid pada order ${label}.`;
  }
  if (payment.amountRp < o.totalRp) {
    return `Nominal bayar kurang dari total pada order ${label}.`;
  }
  if (!("changeRp" in o) || !isInt(o.changeRp) || o.changeRp !== payment.amountRp - o.totalRp) {
    return `Kembalian tidak sesuai pada order ${label}.`;
  }
  if (!("paidAt" in payment) || !isParseableDate(payment.paidAt)) {
    return `Tanggal bayar tidak valid pada order ${label}.`;
  }
  if (!("createdAt" in o) || !isParseableDate(o.createdAt)) {
    return `Tanggal order tidak valid pada order ${label}.`;
  }
  if (!("notes" in o) || (o.notes !== null && (typeof o.notes !== "string" || o.notes.length > MAX_NOTES_LEN))) {
    return `Catatan tidak valid pada order ${label}.`;
  }
  return null;
}

export function importBackupJson(json: string): { orders: Order[]; count: number } {
  if (typeof json !== "string" || json.length === 0) {
    throw new Error("Format backup tidak valid.");
  }
  if (json.length > MAX_BACKUP_BYTES) {
    throw new Error("Ukuran backup melebihi 10MB.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Format backup tidak valid.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Format backup tidak valid.");
  }
  if (!("schemaVersion" in parsed) || !("orders" in parsed)) {
    throw new Error("Format backup tidak valid.");
  }
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.orders)) {
    throw new Error("Format backup tidak valid.");
  }
  if (parsed.orders.length > MAX_BACKUP_ORDERS) {
    throw new Error("Jumlah order pada backup melebihi 50000.");
  }
  const seen = new Set<string>();
  for (const item of parsed.orders) {
    const error = validateBackupOrder(item);
    if (error) {
      throw new Error(error);
    }
    if (typeof item !== "object" || item === null || !("id" in item) || typeof item.id !== "string") {
      throw new Error("ID order tidak valid pada backup.");
    }
    if (seen.has(item.id)) {
      throw new Error(`Duplikat order ${item.id} pada backup.`);
    }
    seen.add(item.id);
  }
  // Tiap order lolos validasi penuh di atas; normalisasi extras backup lama → 0.
  const orders = (parsed.orders as Order[]).map((o) => ({
    ...o,
    serviceChargeRp: typeof o.serviceChargeRp === "number" ? o.serviceChargeRp : 0,
    roundingRp: typeof o.roundingRp === "number" ? o.roundingRp : 0,
  }));
  saveOrders(orders);
  return { orders, count: orders.length };
}

export function listBackups(): BackupRecord[] {
  const raw = readRaw(BACKUP_INDEX_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BackupRecord[]) : [];
  } catch {
    return [];
  }
}

export function downloadBackup(): BackupRecord {
  const orders = loadOrders();
  const record: BackupRecord = {
    name: `pos-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    createdAt: new Date().toISOString(),
    orderCount: orders.length,
  };
  const blob = new Blob([exportBackupJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = record.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  writeRaw(BACKUP_INDEX_KEY, JSON.stringify([record, ...listBackups()].slice(0, 20)));
  return record;
}
