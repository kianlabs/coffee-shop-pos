/** Deterministic generator for performance test data (task 26.1, req 27.1: 100k orders, 1k products by default). Pure: time and seed are inputs. */
export interface PerfConfig {
  seed: number;
  orders: number;
  products: number;
  ingredients: number;
  /** ISO instant of the first order; orders are spaced `minutesBetweenOrders` apart. */
  startIso: string;
  minutesBetweenOrders: number;
}
export const DEFAULT_PERF: PerfConfig = {
  seed: 42,
  orders: 100_000,
  products: 1_000,
  ingredients: 60,
  startIso: "2024-01-01T08:00:00.000Z",
  minutesBetweenOrders: 7,
};
export interface PerfRows {
  products: unknown[][];
  ingredients: unknown[][];
  orders: unknown[][];
  items: unknown[][];
  payments: unknown[][];
  movements: unknown[][];
}
type Rng = () => number;
/** mulberry32: small, fast, reproducible. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
const pad = (n: number, w: number): string => String(n).padStart(w, "0");
const METHODS = ["cash", "cash", "qris_manual", "card_edc", "bank_transfer"] as const;
function pickStatus(rng: Rng): string {
  const r = rng();
  if (r < 0.03) return "voided";
  if (r < 0.05) return "refunded";
  return "completed";
}
export function generatePerfData(config: PerfConfig = DEFAULT_PERF): PerfRows {
  const rng = createRng(config.seed);
  const start = Date.parse(config.startIso);
  if (!Number.isFinite(start)) throw new Error("startIso tidak valid");
  const rows: PerfRows = { products: [], ingredients: [], orders: [], items: [], payments: [], movements: [] };
  const prices: number[] = [];
  for (let p = 0; p < config.products; p++) {
    prices.push(int(rng, 8, 60) * 1000);
    rows.products.push([`prd-${pad(p, 5)}`, `Produk ${p}`, prices[p], config.startIso, config.startIso]);
  }
  for (let g = 0; g < config.ingredients; g++) {
    rows.ingredients.push([`ing-${pad(g, 3)}`, `Bahan ${g}`, "g", 1_000_000_000, config.startIso]);
  }
  for (let o = 0; o < config.orders; o++) appendOrder(rows, config, rng, o, start);
  return rows;
}
function appendOrder(rows: PerfRows, config: PerfConfig, rng: Rng, o: number, start: number): void {
  const id = `ord-${pad(o, 7)}`;
  const createdAt = new Date(start + o * config.minutesBetweenOrders * 60_000).toISOString();
  let subtotal = 0;
  const lineCount = int(rng, 1, 5);
  for (let l = 0; l < lineCount; l++) {
    const productIdx = int(rng, 0, config.products - 1);
    const qty = int(rng, 1, 3);
    const unit = rows.products[productIdx][2] as number;
    subtotal += unit * qty;
    rows.items.push([`${id}-i${l}`, id, `prd-${pad(productIdx, 5)}`, `Produk ${productIdx}`, qty, unit, unit * qty, Math.round(unit * qty * 0.35), createdAt]);
  }
  const tax = Math.round(subtotal * 0.11);
  const total = subtotal + tax;
  rows.orders.push([id, `R-${pad(o, 7)}`, `idem-${id}`, pickStatus(rng), subtotal, tax, total, createdAt, createdAt]);
  const method = METHODS[int(rng, 0, METHODS.length - 1)];
  rows.payments.push([`${id}-pay`, id, method, total, "paid", createdAt, createdAt]);
  const first = int(rng, 0, config.ingredients - 1);
  for (let m = 0; m < 2; m++) {
    const ingredient = `ing-${pad((first + m) % config.ingredients, 3)}`;
    rows.movements.push([`${id}-m${m}`, ingredient, -int(rng, 5, 200) * 1000, "order", id, createdAt]);
  }
}
