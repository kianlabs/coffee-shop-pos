import type { Rupiah } from "./money";

/**
 * HPP (Harga Pokok Penjualan) — murni, tanpa DB.
 *
 * DEFAULT costing: LAST-COST — cost per ingredient = entri terakhir di
 * `ingredient_cost_history` terurut `effective_at` DESC (lihat
 * `resolveLastCost` / `stock.ts#getLastCosts`).
 * Cara ganti ke average/FIFO kelak: cukup ganti resolver cost (satu fungsi
 * `resolveLastCost` + query di `stock.ts`) menjadi rata-rata tertimbang atau
 * konsumsi lot FIFO; fungsi `calcHppForLine`/`snapshotForOrder` di bawah
 * tidak perlu berubah karena hanya menerima `costPerUnitRp` jadi.
 */

export type RecipeLineInput = {
  ingredientId: string;
  ingredientName: string;
  /** Takaran per 1 unit produk jual, dalam satuan dasar ingredient. Harus > 0. */
  qtyPerUnit: number;
  /** Cost terakhir per satuan dasar, Rupiah integer >= 0. */
  costPerUnitRp: Rupiah;
};

export type HppLine = {
  ingredientId: string;
  ingredientName: string;
  qtyPerUnit: number;
  costPerUnitRp: Rupiah;
  /** Math.round(qtyPerUnit * costPerUnitRp), integer Rupiah per 1 unit jual. */
  lineCostRp: Rupiah;
};

export type HppResult = {
  /** Total HPP per 1 unit produk jual (integer Rupiah). */
  perUnitRp: Rupiah;
  lines: HppLine[];
};

export type CostHistoryEntry = {
  ingredientId: string;
  costPerUnitRp: Rupiah;
  effectiveAt: string;
};

function assertValidLine(line: RecipeLineInput): void {
  if (!line.ingredientId) throw new Error("ingredientId wajib diisi.");
  if (!Number.isFinite(line.qtyPerUnit) || line.qtyPerUnit <= 0) {
    throw new Error(`Takaran bahan "${line.ingredientName || line.ingredientId}" harus lebih dari 0.`);
  }
  if (!Number.isFinite(line.costPerUnitRp) || line.costPerUnitRp < 0) {
    throw new Error(`Harga bahan "${line.ingredientName || line.ingredientId}" tidak boleh negatif.`);
  }
}

export function calcHppForLine(items: RecipeLineInput[]): HppResult {
  const lines: HppLine[] = items.map((item) => {
    assertValidLine(item);
    const cost = Math.trunc(item.costPerUnitRp);
    const lineCostRp = Math.round(item.qtyPerUnit * cost);
    return {
      ingredientId: item.ingredientId,
      ingredientName: item.ingredientName,
      qtyPerUnit: item.qtyPerUnit,
      costPerUnitRp: cost,
      lineCostRp,
    };
  });
  let perUnitRp = 0;
  for (const l of lines) perUnitRp += l.lineCostRp;
  return { perUnitRp, lines };
}

/**
 * Resolver LAST-COST (DEFAULT): untuk tiap ingredient ambil entri dengan
 * `effectiveAt` terbesar. Entri tanpa harga (= tidak ada) diabaikan pemanggil.
 */
export function resolveLastCost(entries: CostHistoryEntry[]): Map<string, Rupiah> {
  const best = new Map<string, CostHistoryEntry>();
  for (const e of entries) {
    const cur = best.get(e.ingredientId);
    if (!cur || e.effectiveAt > cur.effectiveAt) best.set(e.ingredientId, e);
  }
  const out = new Map<string, Rupiah>();
  for (const [id, e] of best) out.set(id, Math.trunc(e.costPerUnitRp));
  return out;
}

export type CostSnapshotRow = {
  orderItemId: string;
  ingredientId: string;
  ingredientName: string;
  /** qtyPerUnit * qtyOrdered (satuan dasar). */
  qty: number;
  costPerUnitRp: Rupiah;
  /** Math.round(qty * costPerUnitRp). */
  lineCostRp: Rupiah;
};

/**
 * Bangun baris snapshot HPP untuk satu order item (siap insert ke
 * `order_item_cost_snapshots`). Total HPP item = jumlah `lineCostRp`.
 */
export function snapshotForOrder(
  orderItemId: string,
  qtyOrdered: number,
  hpp: HppResult,
): { rows: CostSnapshotRow[]; hppTotalRp: Rupiah } {
  if (!orderItemId) throw new Error("orderItemId wajib diisi.");
  if (!Number.isFinite(qtyOrdered) || qtyOrdered <= 0) {
    throw new Error("Jumlah pesanan harus lebih dari 0.");
  }
  const rows: CostSnapshotRow[] = hpp.lines.map((l) => {
    const qty = l.qtyPerUnit * qtyOrdered;
    return {
      orderItemId,
      ingredientId: l.ingredientId,
      ingredientName: l.ingredientName,
      qty,
      costPerUnitRp: l.costPerUnitRp,
      lineCostRp: Math.round(qty * l.costPerUnitRp),
    };
  });
  let hppTotalRp = 0;
  for (const r of rows) hppTotalRp += r.lineCostRp;
  return { rows, hppTotalRp };
}
