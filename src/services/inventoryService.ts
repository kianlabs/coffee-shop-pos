import { divRoundHalfUp } from "@/domain/rounding";
import { planStocktake, type Movement } from "@/domain/stockLedger";
import type { Clock, Ids } from "./ports";
import type { InventoryTx, InventoryUnitOfWork, MovementRecord, PurchaseRecord, StocktakeRecord, SupplierRecord } from "./ports/inventory";
import type { SettingsService } from "./settingsService";
import { describeFields, isPositiveMilli, isValidTotal, supplierErrors, textError, type FieldErrors } from "./inventoryValidation";

export interface InventoryActor {
  id: string;
  role: "owner" | "supervisor" | "kasir";
}

export type InventoryErrorCode = "invalid_input" | "save_failed";
export type InventoryResult<T> = { ok: true; value: T } | { ok: false; code: InventoryErrorCode; message: string; fields?: FieldErrors };

export interface InventoryServiceDeps {
  uow: InventoryUnitOfWork;
  settings: Pick<SettingsService, "get">;
  clock: Clock;
  ids: Ids;
}

export interface PurchaseInput {
  supplierId: string;
  ingredientId: string;
  qtyMilli: number;
  totalRp: number;
}

export interface WasteInput {
  ingredientId: string;
  qtyMilli: number;
  reason: string;
}

export interface StockStatus {
  ingredientId: string;
  name: string;
  stockMilli: number;
  minStockMilli: number | null;
  /** Stock is at or below the configured threshold. */
  low: boolean;
  negative: boolean;
}

/** Thrown inside a transaction to roll back and report invalid fields. */
class Invalid extends Error {
  constructor(readonly fields: FieldErrors) {
    super(describeFields(fields));
  }
}

/**
 * Suppliers, purchases, waste, and stocktakes. Each write is one transaction holding its movements,
 * cost history, and audit row, so a failure leaves stock untouched (Req 8.2 to 8.5, 8.10, 8.11).
 */
export class InventoryService {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly deps: InventoryServiceDeps) {}

  addSupplier(actor: InventoryActor, input: { name: string; contact?: string; note?: string }): Promise<InventoryResult<SupplierRecord>> {
    return this.atomic(async (tx) => {
      const s = this.deps.settings;
      const limits = { nameMax: s.get("stok.supplier_nama_maks_karakter"), contactMax: s.get("stok.supplier_kontak_maks_karakter"), noteMax: s.get("stok.supplier_catatan_maks_karakter") };
      const fields = { name: input.name, contact: input.contact ?? "", note: input.note ?? "" };
      const errors = supplierErrors(fields, limits, await tx.suppliers.list());
      if (Object.keys(errors).length > 0) throw new Invalid(errors);
      const supplier: SupplierRecord = { id: this.deps.ids.next(), name: fields.name.trim(), contact: fields.contact.trim(), note: fields.note.trim(), createdAt: this.now() };
      await tx.suppliers.insert(supplier);
      await this.audit(tx, actor, "supplier.create", "supplier", supplier.id, { name: supplier.name }, null);
      return supplier;
    });
  }

  /** Purchase raises stock and records cost per base unit = total ÷ quantity (Req 8.2). */
  recordPurchase(actor: InventoryActor, input: PurchaseInput): Promise<InventoryResult<PurchaseRecord>> {
    return this.atomic(async (tx) => {
      const errors: FieldErrors = {};
      if (!(await tx.suppliers.get(input.supplierId))) errors.supplierId = "Supplier belum tersimpan.";
      if (!(await tx.inventory.getIngredient(input.ingredientId))) errors.ingredientId = "Bahan tidak ditemukan.";
      if (!isPositiveMilli(input.qtyMilli)) errors.qtyMilli = "Jumlah harus lebih dari 0.";
      if (!isValidTotal(input.totalRp)) errors.totalRp = "Total harga harus 0 sampai 999.999.999 Rupiah.";
      if (Object.keys(errors).length > 0) throw new Invalid(errors);
      const now = this.now();
      const purchase: PurchaseRecord = {
        id: this.deps.ids.next(), supplierId: input.supplierId, ingredientId: input.ingredientId, qtyMilli: input.qtyMilli,
        totalRp: input.totalRp, unitCostRp: divRoundHalfUp(input.totalRp * 1000, input.qtyMilli), purchasedAt: now, createdBy: actor.id,
      };
      await tx.purchases.insert(purchase);
      await tx.inventory.addMovement(this.movement(actor, { ingredientId: input.ingredientId, type: "purchase_received", qtyMilli: input.qtyMilli }, "purchase", purchase.id, null));
      await tx.inventory.addCostHistory({ id: this.deps.ids.next(), ingredientId: input.ingredientId, costPerUnitRp: purchase.unitCostRp, effectiveAt: now, createdAt: now });
      await this.audit(tx, actor, "stock.purchase", "purchase", purchase.id, { qtyMilli: purchase.qtyMilli, totalRp: purchase.totalRp }, null);
      return purchase;
    });
  }

  recordWaste(actor: InventoryActor, input: WasteInput): Promise<InventoryResult<MovementRecord>> {
    return this.atomic(async (tx) => {
      const errors: FieldErrors = {};
      if (!(await tx.inventory.getIngredient(input.ingredientId))) errors.ingredientId = "Bahan tidak ditemukan.";
      if (!isPositiveMilli(input.qtyMilli)) errors.qtyMilli = "Jumlah harus lebih dari 0.";
      const reason = textError("Alasan", input.reason, 1, this.deps.settings.get("kasir.alasan_maks_karakter"));
      if (reason) errors.reason = reason;
      if (Object.keys(errors).length > 0) throw new Invalid(errors);
      const id = this.deps.ids.next();
      const movement = this.movement(actor, { ingredientId: input.ingredientId, type: "waste", qtyMilli: input.qtyMilli }, "waste", id, input.reason.trim());
      await tx.inventory.addMovement(movement);
      await this.audit(tx, actor, "stock.waste", "ingredient", input.ingredientId, { qtyMilli: input.qtyMilli }, movement.reason);
      return movement;
    });
  }

  /** `counts` maps ingredient id to physical count in milli. Zero-difference ingredients get no movement (Req 8.4). */
  completeStocktake(actor: InventoryActor, counts: Readonly<Record<string, number>>): Promise<InventoryResult<StocktakeRecord>> {
    return this.atomic(async (tx) => {
      const ids = Object.keys(counts).sort();
      const errors: FieldErrors = {};
      if (ids.length === 0) errors.counts = "Isi hitungan fisik minimal satu bahan.";
      for (const id of ids) {
        if (!Number.isSafeInteger(counts[id]) || counts[id] < 0) errors[id] = `Hitungan fisik ${id} tidak boleh negatif.`;
        else if (!(await tx.inventory.getIngredient(id))) errors[id] = `Bahan ${id} tidak ditemukan.`;
      }
      if (Object.keys(errors).length > 0) throw new Invalid(errors);
      const system = await tx.inventory.stockByIngredient();
      const stocktakeId = this.deps.ids.next();
      for (const m of planStocktake(system, counts)) {
        await tx.inventory.addMovement(this.movement(actor, m, "stocktake", stocktakeId, "Stok opname"));
      }
      const record: StocktakeRecord = {
        id: stocktakeId, completedAt: this.now(), completedBy: actor.id,
        items: ids.map((id) => ({ ingredientId: id, systemMilli: system[id] ?? 0, countedMilli: counts[id] })),
      };
      await tx.stocktakes.insert(record);
      await this.audit(tx, actor, "stock.stocktake", "stocktake", stocktakeId, null, null);
      return record;
    });
  }

  /** Stock per ingredient with low and negative flags (Req 8.6, 8.9). */
  stockStatus(): Promise<StockStatus[]> {
    return this.deps.uow.transact(async (tx) => {
      const [ingredients, stock] = await Promise.all([tx.inventory.ingredients(), tx.inventory.stockByIngredient()]);
      return ingredients.map((i) => {
        const stockMilli = stock[i.id] ?? 0;
        const low = i.minStockMilli !== null && stockMilli <= i.minStockMilli;
        return { ingredientId: i.id, name: i.name, stockMilli, minStockMilli: i.minStockMilli, low, negative: stockMilli < 0 };
      });
    });
  }

  async lowStockAlerts(): Promise<StockStatus[]> {
    return (await this.stockStatus()).filter((s) => s.low);
  }

  private movement(actor: InventoryActor, m: Movement, refType: MovementRecord["refType"], refId: string, reason: string | null): MovementRecord {
    return { id: this.deps.ids.next(), ...m, reason, refType, refId, createdAt: this.now(), createdBy: actor.id };
  }

  private now(): string {
    return this.deps.clock.now().toISOString();
  }

  private audit(tx: InventoryTx, actor: InventoryActor, action: string, entityType: string, entityId: string, after: unknown, reason: string | null): Promise<void> {
    return tx.audit.append({
      id: this.deps.ids.next(), actorId: actor.id, approverId: null, action, actionType: null,
      entityType, entityId, before: null, after, reason, createdAt: this.now(),
    });
  }

  private atomic<T>(fn: (tx: InventoryTx) => Promise<T>): Promise<InventoryResult<T>> {
    const attempt = async (): Promise<InventoryResult<T>> => {
      try {
        return { ok: true, value: await this.deps.uow.transact(fn) };
      } catch (e) {
        if (e instanceof Invalid) return { ok: false, code: "invalid_input", message: e.message, fields: e.fields };
        return { ok: false, code: "save_failed", message: "Penyimpanan gagal. Data tidak berubah, isian Anda tetap ada." };
      }
    };
    const result = this.queue.then(attempt, attempt);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
