import { createCompletedOrder, validateCheckout, type CheckoutInput, type Order } from "../domain/orders";

const ORDERS_KEY = "pos.orders.v1";
const BACKUP_INDEX_KEY = "pos.backups.v1";

export type StoreShape = {
  schemaVersion: 1;
  orders: Order[];
};

export type BackupRecord = {
  name: string;
  createdAt: string;
  orderCount: number;
};

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  localStorage.setItem(key, value);
}

export function loadOrders(): Order[] {
  const raw = readRaw(ORDERS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as StoreShape;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.orders)) {
      return [];
    }
    return parsed.orders;
  } catch {
    return [];
  }
}

function saveOrders(orders: Order[]): void {
  const shape: StoreShape = { schemaVersion: 1, orders };
  writeRaw(ORDERS_KEY, JSON.stringify(shape));
}

export function checkoutAtomic(input: CheckoutInput): { order: Order; duplicate: boolean } {
  const error = validateCheckout(input);
  if (error) {
    throw new Error(error);
  }
  const existing = loadOrders().find((o) => o.idempotencyKey === input.idempotencyKey);
  if (existing) {
    return { order: existing, duplicate: true };
  }
  const order = createCompletedOrder(input, new Date());
  saveOrders([order, ...loadOrders()]);
  return { order, duplicate: false };
}

export function voidOrder(orderId: string): Order[] {
  const orders = loadOrders().map((o) =>
    o.id === orderId ? { ...o, status: "voided" as const } : o,
  );
  saveOrders(orders);
  return orders;
}

export function exportBackupJson(): string {
  return JSON.stringify(
    { schemaVersion: 1, exportedAt: new Date().toISOString(), orders: loadOrders() },
    null,
    2,
  );
}

export function importBackupJson(json: string): { orders: Order[]; count: number } {
  const parsed = JSON.parse(json) as { schemaVersion?: number; orders?: Order[] };
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.orders)) {
    throw new Error("Format backup tidak valid.");
  }
  saveOrders(parsed.orders);
  return { orders: parsed.orders, count: parsed.orders.length };
}

export function listBackups(): BackupRecord[] {
  const raw = readRaw(BACKUP_INDEX_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as BackupRecord[];
    return Array.isArray(parsed) ? parsed : [];
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
