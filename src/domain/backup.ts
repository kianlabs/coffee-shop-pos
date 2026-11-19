/**
 * Backup document format `pos-backup-v3`. Pure: SHA-256 is injected so the data
 * layer can supply node:crypto or WebCrypto.
 */
export const BACKUP_FORMAT = "pos-backup-v3";
export type BackupCell = string | number | null;
export interface BackupTable {
  columns: string[];
  rows: BackupCell[][];
}
export type BackupTables = Record<string, BackupTable>;
export interface BackupDocument {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  createdAt: string;
  appVersion: string;
  tables: BackupTables;
  /** `sha256:<hex>` over the canonical JSON of `tables`. */
  checksum: string;
}
export type BackupSha256 = (input: string) => string | Promise<string>;
export type BackupRejection = "format" | "checksum" | "newer-schema";
export const BACKUP_REJECTION_MESSAGES: Record<BackupRejection, string> = {
  format: "File backup tidak valid atau rusak.",
  checksum: "Checksum backup tidak cocok. File backup rusak atau telah diubah.",
  "newer-schema": "Backup dibuat oleh versi aplikasi yang lebih baru. Perbarui aplikasi sebelum restore.",
};
const CHECKSUM_PREFIX = "sha256:";
const cellRank = (c: BackupCell): number => (c === null ? 0 : typeof c === "number" ? 1 : 2);
/** Total order on cells: null < number < string; strings by code unit. */
export function compareCells(a: BackupCell, b: BackupCell): number {
  const rank = cellRank(a) - cellRank(b);
  if (rank !== 0) return rank;
  if (a === null || b === null) return 0;
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
export function compareRows(a: readonly BackupCell[], b: readonly BackupCell[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = compareCells(a[i], b[i]);
    if (c !== 0) return c;
  }
  return a.length - b.length;
}
/**
 * Canonical form: table names sorted, rows sorted lexicographically in column
 * order. Every table here has its primary key as the first column, so this is
 * primary-key order. Inputs are not mutated.
 */
export function normalizeTables(tables: BackupTables): BackupTables {
  const out: BackupTables = {};
  for (const name of Object.keys(tables).sort()) {
    const t = tables[name];
    out[name] = { columns: [...t.columns], rows: t.rows.map((r) => [...r]).sort(compareRows) };
  }
  return out;
}
/** JSON with object keys sorted at every level. Rejects values JSON cannot represent exactly. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Angka tidak valid untuk JSON kanonis.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).filter((k) => record[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(",")}}`;
  }
  throw new Error(`Tipe ${typeof value} tidak didukung JSON kanonis.`);
}
export async function computeChecksum(tables: BackupTables, sha256: BackupSha256): Promise<string> {
  return CHECKSUM_PREFIX + (await sha256(canonicalJson(normalizeTables(tables))));
}
export interface BackupInput {
  schemaVersion: number;
  createdAt: string;
  appVersion: string;
  tables: BackupTables;
}
export async function createBackupDocument(input: BackupInput, sha256: BackupSha256): Promise<BackupDocument> {
  const tables = normalizeTables(input.tables);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: input.schemaVersion,
    createdAt: input.createdAt,
    appVersion: input.appVersion,
    tables,
    checksum: await computeChecksum(tables, sha256),
  };
}
export function serializeBackupDocument(doc: BackupDocument): string {
  return canonicalJson(doc);
}
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCell = (v: unknown): v is BackupCell =>
  v === null || typeof v === "string" || (typeof v === "number" && Number.isFinite(v));
function isTable(v: unknown): v is BackupTable {
  if (!isRecord(v) || !Array.isArray(v.columns) || !Array.isArray(v.rows)) return false;
  const cols: unknown[] = v.columns;
  if (!cols.every((c) => typeof c === "string" && c !== "")) return false;
  if (new Set(cols).size !== cols.length) return false;
  return v.rows.every((r: unknown) => Array.isArray(r) && r.length === cols.length && r.every(isCell));
}
function isDocument(v: unknown): v is BackupDocument {
  if (!isRecord(v) || v.format !== BACKUP_FORMAT) return false;
  if (typeof v.schemaVersion !== "number" || !Number.isInteger(v.schemaVersion) || v.schemaVersion < 0) return false;
  if (typeof v.createdAt !== "string" || typeof v.appVersion !== "string") return false;
  if (typeof v.checksum !== "string" || !v.checksum.startsWith(CHECKSUM_PREFIX)) return false;
  return isRecord(v.tables) && Object.keys(v.tables).every((k) => k !== "" && isTable((v.tables as Record<string, unknown>)[k]));
}
export type ParseBackupResult =
  | { ok: true; document: BackupDocument }
  | { ok: false; reason: "format"; message: string };
/** Shape check only. Call `verifyBackupDocument` before restoring. */
export function parseBackupDocument(text: string): ParseBackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "format", message: BACKUP_REJECTION_MESSAGES.format };
  }
  if (!isDocument(raw)) return { ok: false, reason: "format", message: BACKUP_REJECTION_MESSAGES.format };
  return { ok: true, document: raw };
}
export interface VerifyOptions {
  sha256: BackupSha256;
  latestSchemaVersion: number;
}
/** Returns why the document must not be restored, or null when it may be. */
export async function verifyBackupDocument(doc: BackupDocument, opts: VerifyOptions): Promise<BackupRejection | null> {
  if ((await computeChecksum(doc.tables, opts.sha256)) !== doc.checksum) return "checksum";
  if (doc.schemaVersion > opts.latestSchemaVersion) return "newer-schema";
  return null;
}
/** Equivalence used by the round-trip property: everything except createdAt and checksum. */
export function backupContentEqual(a: BackupDocument, b: BackupDocument): boolean {
  const key = (d: BackupDocument) =>
    canonicalJson({ format: d.format, schemaVersion: d.schemaVersion, appVersion: d.appVersion, tables: normalizeTables(d.tables) });
  return key(a) === key(b);
}
