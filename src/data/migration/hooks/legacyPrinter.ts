import type { DbPort } from "@/data/dbPort";
import type { DataHook } from "@/data/migration/runner";
export const LEGACY_PRINTER_ID = "printer-legacy";
/** `app_settings` keys that held the single old printer. */
const KEYS = { address: "printer.alamat", name: "printer.nama", paper: "printer.lebar_kertas" } as const;
async function settingText(db: DbPort, key: string): Promise<string | null> {
  const rows = await db.query<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [key]);
  const raw = rows[0]?.value;
  if (raw === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? parsed.trim() : null;
  } catch {
    return raw.trim();
  }
}
/** The one printer saved in settings becomes a single `printers` row (receipt role). No address, no row. */
export const legacyPrinterHook: DataHook = async (db) => {
  const address = await settingText(db, KEYS.address);
  if (address === null || address === "") return;
  const name = (await settingText(db, KEYS.name)) || address;
  const paper = (await settingText(db, KEYS.paper)) === "80mm" ? "80mm" : "58mm";
  await db.run(
    "INSERT OR IGNORE INTO printers (id, alias, name, address, role, paper) VALUES (?, 'Kasir', ?, ?, 'receipt', ?)",
    [LEGACY_PRINTER_ID, name, address, paper],
  );
};
