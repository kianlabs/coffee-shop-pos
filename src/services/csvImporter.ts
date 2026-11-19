import { catalogKey, isCatalogHeader, validateCatalogRows, type CatalogRow, type RowError } from "@/domain/catalogCsv";
import { CsvParseError, decodeCsv } from "@/domain/csv";
import { SENSITIVE_ACTIONS, hasAtLeast, type Role } from "@/domain/permissions";
import type { Clock, Ids } from "./ports";
import type { CatalogImportUnitOfWork, ExistingCatalogRow } from "./ports/catalogImport";

export interface ImportLimits {
  /** `impor.ukuran_maks_mb` */
  maxSizeMb: number;
  /** `impor.baris_maks` */
  maxRows: number;
  /** `katalog.harga_maks_rupiah` */
  maxPriceRp: number;
}

export interface ImportActor {
  id: string;
  role: Role;
}

export interface ImportFile {
  name: string;
  bytes: Uint8Array;
}

export type RejectCode = "size" | "encoding" | "csv" | "header" | "rows";

/** Stage 1 result. Nothing was written. */
export type ImportPreview =
  | { ok: false; code: RejectCode; message: string }
  | { ok: true; fileName: string; rows: CatalogRow[]; newCount: number; updatedCount: number; errors: RowError[]; changesPrice: boolean };

export type CommitResult =
  | { ok: true; created: number; updated: number; skipped: number }
  | { ok: false; code: "approval_required" | "nothing_to_import" | "import_failed"; message: string };

export interface CsvImporterDeps {
  uow: CatalogImportUnitOfWork;
  clock: Clock;
  ids: Ids;
  limits: () => Promise<ImportLimits> | ImportLimits;
}

const reject = (code: RejectCode, message: string): ImportPreview => ({ ok: false, code, message });

function sameValues(a: ExistingCatalogRow, r: CatalogRow): boolean {
  return a.priceRp === r.priceRp && a.hppManualRp === r.hppManualRp;
}

/** Splits rows into new and updated against the catalog, and flags any price/HPP creation or change. */
function classify(rows: readonly CatalogRow[], existing: readonly ExistingCatalogRow[]) {
  const byKey = new Map(existing.map((e) => [e.key, e]));
  let newCount = 0;
  let updatedCount = 0;
  let changesPrice = false;
  for (const r of rows) {
    const found = byKey.get(catalogKey(r));
    if (!found) newCount += 1;
    else updatedCount += 1;
    if (!found || !sameValues(found, r)) changesPrice = true;
  }
  return { newCount, updatedCount, changesPrice };
}

/**
 * Catalog CSV import in two stages (Req 12.2, 12.4, 12.7, 12.8, 12.9).
 * `parse` validates and previews without writing; `commit` writes the valid rows in one transaction with one audit row.
 */
export class CsvImporter {
  constructor(private readonly deps: CsvImporterDeps) {}

  async parse(file: ImportFile): Promise<ImportPreview> {
    const limits = await this.deps.limits();
    if (file.bytes.length > limits.maxSizeMb * 1024 * 1024) {
      return reject("size", `Ukuran file melebihi batas ${limits.maxSizeMb} MB.`);
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    } catch {
      return reject("encoding", "File bukan UTF-8 yang valid.");
    }
    let records: string[][];
    try {
      records = decodeCsv(text);
    } catch (e) {
      return reject("csv", e instanceof CsvParseError ? e.message : "File CSV tidak dapat dibaca.");
    }
    const [header, ...data] = records;
    if (!isCatalogHeader(header)) {
      return reject("header", "Header tidak cocok. Kolom harus: category,product,variant,price_rp,hpp_manual_rp.");
    }
    if (data.length > limits.maxRows) {
      return reject("rows", `Jumlah baris data ${data.length} melebihi batas ${limits.maxRows}.`);
    }
    const { valid, errors } = validateCatalogRows(data, limits.maxPriceRp);
    const rows = valid.map((v) => v.row);
    const existing = await this.deps.uow.transact((tx) => tx.catalog.loadExisting());
    return { ok: true, fileName: file.name, rows, errors, ...classify(rows, existing) };
  }

  /**
   * Writes the valid rows of a preview, skipping error rows. A `kasir` needs an approver of
   * supervisor level or higher when the import creates or changes a price or HPP.
   */
  async commit(preview: Extract<ImportPreview, { ok: true }>, actor: ImportActor, approver?: ImportActor): Promise<CommitResult> {
    if (preview.rows.length === 0) {
      return { ok: false, code: "nothing_to_import", message: "Tidak ada baris valid untuk diimpor." };
    }
    try {
      return await this.deps.uow.transact(async (tx) => {
        // Counts are recomputed inside the transaction: the catalog may have changed since the preview.
        const { newCount, updatedCount, changesPrice } = classify(preview.rows, await tx.catalog.loadExisting());
        const approverId = this.approverFor(changesPrice, actor, approver);
        if (approverId === undefined) {
          return { ok: false as const, code: "approval_required" as const, message: "Impor mengubah harga atau HPP. Minta PIN supervisor atau owner." };
        }
        await tx.catalog.upsertAll(preview.rows);
        const skipped = preview.errors.length === 0 ? 0 : new Set(preview.errors.map((e) => e.line)).size;
        await tx.audit.append({
          id: this.deps.ids.next(),
          actorId: actor.id,
          approverId,
          action: "catalog.import",
          actionType: approverId ? "csv_import_price" : null,
          entityType: "catalog",
          entityId: preview.fileName,
          before: null,
          after: { fileName: preview.fileName, created: newCount, updated: updatedCount, skipped },
          reason: null,
          createdAt: this.deps.clock.now().toISOString(),
        });
        return { ok: true as const, created: newCount, updated: updatedCount, skipped };
      });
    } catch {
      return { ok: false, code: "import_failed", message: "Impor gagal. Katalog tidak berubah." };
    }
  }

  /** Returns the approver id (null when none is needed), or undefined when approval is missing. */
  private approverFor(changesPrice: boolean, actor: ImportActor, approver?: ImportActor): string | null | undefined {
    const min = SENSITIVE_ACTIONS.csv_import_price;
    if (!changesPrice || hasAtLeast(actor.role, min)) return null;
    if (approver && hasAtLeast(approver.role, min)) return approver.id;
    return undefined;
  }
}
