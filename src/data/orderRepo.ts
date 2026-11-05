import type { CheckoutInput, Order } from "../domain/orders";
import { isNativePlatform } from "./db";
import {
  checkoutAtomicAsync,
  exportBackupJsonAsync,
  importBackupJsonAsync,
  loadAllOrdersAsync,
  loadOrdersAsync,
  refundOrderAsync,
  voidOrderAsync,
  type BackupRecord,
} from "./orderRepository";
import {
  checkoutAtomic,
  downloadBackup,
  exportBackupJson,
  importBackupJson,
  listBackups,
  loadOrders,
  refund,
  voidOrder,
} from "./orderStore";

export type { BackupRecord };

/** Sekali saja di module-scope; App memakai ini, bukan `useSqlite` lokal. */
export const isNative = isNativePlatform();

export interface OrderRepo {
  load(limit?: number): Promise<Order[]>;
  /** Semua order tanpa cap — dipakai rekap shift, bukan daftar riwayat. */
  loadAll(): Promise<Order[]>;
  checkout(input: CheckoutInput): Promise<{ order: Order; duplicate: boolean }>;
  void(id: string): Promise<Order[]>;
  refund(id: string): Promise<Order[]>;
  exportJson(): Promise<string>;
  importJson(json: string): Promise<number>;
  listBackups(): BackupRecord[];
  downloadBackup(): BackupRecord;
}

function applyLimit(rows: Order[], limit?: number): Order[] {
  return limit === undefined ? rows : rows.slice(0, limit);
}

/** Bungkus sync browser store dalam Promise agar seragam dengan SQLite. */
export const browserRepo: OrderRepo = {
  load: (limit) => Promise.resolve(applyLimit(loadOrders(), limit)),
  loadAll: () => Promise.resolve(loadOrders()),
  checkout: (input) => Promise.resolve(checkoutAtomic(input)),
  void: (id) => Promise.resolve(voidOrder(id)),
  refund: (id) => Promise.resolve(refund(id)),
  exportJson: () => Promise.resolve(exportBackupJson()),
  importJson: (json) => Promise.resolve(importBackupJson(json).count),
  listBackups: () => listBackups(),
  downloadBackup: () => downloadBackup(),
};

/** Bungkus repo SQLite async. */
export const sqliteRepo: OrderRepo = {
  load: (limit) => loadOrdersAsync(limit ?? 200),
  loadAll: () => loadAllOrdersAsync(),
  checkout: (input) => checkoutAtomicAsync(input),
  void: (id) => voidOrderAsync(id),
  refund: (id) => refundOrderAsync(id),
  exportJson: () => exportBackupJsonAsync(),
  importJson: (json) => importBackupJsonAsync(json),
  listBackups: () => listBackups(),
  downloadBackup: () => {
    // Sync tidak bisa menunggu SQLite: pemanggil native WAJIB pakai
    // exportJson() + downloadTextFile() agar isi file benar dari DB.
    throw new Error("SQLite: gunakan exportJson() lalu unduh file backup.");
  },
};

/** Satu-satunya akses data yang dipakai App. */
export const repo: OrderRepo = isNative ? sqliteRepo : browserRepo;

/**
 * UX unduh file Blob — perilaku lama dipertahankan untuk kedua backend,
 * kini satu jalur seragam lewat exportJson().
 */
export function downloadTextFile(text: string, filename: string, mime = "application/json"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function backupFileName(): string {
  return `pos-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}

const BACKUP_INDEX_KEY = "pos.backups.v1";

/**
 * Catat metadata backup ke indeks bersama (localStorage) untuk kedua backend.
 * Catatan: menduplikasi kunci + batas 20 entri milik orderStore karena
 * penulis indeks tidak diekspor dari sana.
 */
export function rememberBackup(record: BackupRecord): void {
  try {
    const raw = localStorage.getItem(BACKUP_INDEX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const prev = Array.isArray(parsed) ? (parsed as BackupRecord[]) : [];
    localStorage.setItem(BACKUP_INDEX_KEY, JSON.stringify([record, ...prev].slice(0, 20)));
  } catch {
    // Metadata backup tidak kritis — kegagalan dicatat diam-diam.
  }
}
