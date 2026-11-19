/**
 * Receipt_Formatter: pure, additive replacement candidate for
 * `renderReceiptText` in `src/data/receipt.ts` (not wired in yet).
 * Output is one string per line; ESC/POS bytes are added later by the printer layer.
 */
import { DEFAULT_RECEIPT_LABELS, type ReceiptLabels } from "./receiptLabels";
import {
  centerLines, formatAmount, formatDateTime, prefixed, rule, sanitize, twoColumn, wrap,
  type ReceiptLang,
} from "./receiptText";
import type { StoreProfile } from "./storeProfile";

export { sanitize, wrap, twoColumn, DEFAULT_RECEIPT_LABELS };
export type { ReceiptLabels, ReceiptLang };

export interface ReceiptModifier { name: string; deltaRp: number }
export interface ReceiptLine {
  name: string;
  variantName?: string | null;
  qty: number;
  unitPriceRp: number;
  lineTotalRp: number;
  modifiers: ReceiptModifier[];
}
export interface ReceiptPayment { method: string; amountRp: number }
export interface ReceiptOrder {
  receiptNumber: string;
  createdAt: Date;
  cashierName: string;
  /** Already-translated order type text; empty/absent = not printed. */
  orderType?: string;
  status: "completed" | "voided" | "refunded";
  lines: ReceiptLine[];
  subtotalRp: number;
  discountRp: number;
  serviceChargeRp: number;
  taxRp: number;
  roundingRp: number;
  totalRp: number;
  payments: ReceiptPayment[];
  changeRp: number;
  notes?: string | null;
}
/** Module-supplied extra lines (e.g. queue number). */
export type ReceiptContributor = (order: ReceiptOrder, ctx: ReceiptContext) => string[];
export interface ReceiptContext {
  widthChars: 32 | 48;
  /** Receipt language, independent of the UI language. */
  lang: ReceiptLang;
  store: StoreProfile;
  /** Translated labels per language, passed in as data. */
  labels?: Record<ReceiptLang, ReceiptLabels>;
  copy?: boolean;
  contributors: ReceiptContributor[];
}
export interface TicketItem { name: string; qty: number; modifiers: string[]; note?: string }

function labelsOf(ctx: ReceiptContext): ReceiptLabels {
  return (ctx.labels ?? DEFAULT_RECEIPT_LABELS)[ctx.lang];
}

function textRows(text: string | null | undefined, w: number, prefix = ""): string[] {
  const clean = sanitize(text ?? "");
  if (clean.trim() === "") return [];
  return prefixed(prefix, clean, w);
}

function header(order: ReceiptOrder, ctx: ReceiptContext, l: ReceiptLabels): string[] {
  const w = ctx.widthChars;
  const s = ctx.store;
  const rows = [...centerLines(sanitize(s.name), w), ...centerLines(sanitize(s.address), w)];
  if (s.npwp.trim() !== "") rows.push(...centerLines(`NPWP: ${sanitize(s.npwp)}`, w));
  rows.push(...centerLines(sanitize(s.receiptHeader), w));
  if (ctx.copy) rows.push(...centerLines(sanitize(l.copy), w));
  if (order.status === "voided") rows.push(...centerLines(l.void, w));
  if (order.status === "refunded") rows.push(...centerLines(l.refund, w));
  return rows;
}

function meta(order: ReceiptOrder, w: number, l: ReceiptLabels): string[] {
  return [
    ...textRows(order.receiptNumber, w, `${l.receiptNo}: `),
    ...wrap(`${l.date}: ${formatDateTime(order.createdAt)}`, w),
    ...textRows(order.cashierName, w, `${l.cashier}: `),
    ...textRows(order.orderType, w, `${l.orderType}: `),
    ...textRows(order.notes, w, `${l.note}: `),
  ];
}

function itemRows(item: ReceiptLine, ctx: ReceiptContext): string[] {
  const w = ctx.widthChars;
  const variant = sanitize(item.variantName ?? "");
  const title = `${sanitize(item.name)}${variant === "" ? "" : ` (${variant})`}`;
  const rows = wrap(title, w);
  const fmt = (n: number): string => formatAmount(n, ctx.lang);
  rows.push(...twoColumn(`  ${item.qty} x ${fmt(item.unitPriceRp)}`, fmt(item.lineTotalRp), w));
  for (const m of item.modifiers) {
    const amount = m.deltaRp === 0 ? "" : `${m.deltaRp > 0 ? "+" : ""}${fmt(m.deltaRp)}`;
    rows.push(...twoColumn(`  + ${sanitize(m.name)}`, amount, w));
  }
  return rows;
}

function totals(order: ReceiptOrder, ctx: ReceiptContext, l: ReceiptLabels): string[] {
  const w = ctx.widthChars;
  const fmt = (n: number): string => formatAmount(n, ctx.lang);
  const rows = twoColumn(l.subtotal, fmt(order.subtotalRp), w);
  if (order.discountRp > 0) rows.push(...twoColumn(l.discount, `-${fmt(order.discountRp)}`, w));
  if (order.serviceChargeRp > 0) rows.push(...twoColumn(l.serviceCharge, fmt(order.serviceChargeRp), w));
  if (order.taxRp > 0) rows.push(...twoColumn(l.tax, fmt(order.taxRp), w));
  if (order.roundingRp !== 0) rows.push(...twoColumn(l.rounding, fmt(order.roundingRp), w));
  rows.push(...twoColumn(l.total, fmt(order.totalRp), w));
  for (const p of order.payments) {
    const name = sanitize(l.payment[p.method] ?? p.method);
    rows.push(...twoColumn(name, fmt(p.amountRp), w));
  }
  rows.push(...twoColumn(l.change, fmt(order.changeRp), w));
  return rows;
}

export function formatReceipt(order: ReceiptOrder, ctx: ReceiptContext): string[] {
  const w = ctx.widthChars;
  const l = labelsOf(ctx);
  const rows = [...header(order, ctx, l), ...meta(order, w, l), rule(w)];
  for (const item of order.lines) rows.push(...itemRows(item, ctx));
  rows.push(rule(w));
  for (const contribute of ctx.contributors) {
    for (const extra of contribute(order, ctx)) rows.push(...textRows(extra, w));
  }
  rows.push(...totals(order, ctx, l), rule(w));
  const footer = sanitize(ctx.store.receiptFooter);
  rows.push(...centerLines(footer.trim() === "" ? l.thanks : footer, w));
  return rows;
}

export function formatKitchenTicket(
  order: ReceiptOrder,
  items: TicketItem[],
  ctx: ReceiptContext,
): string[] {
  const w = ctx.widthChars;
  const l = labelsOf(ctx);
  const rows = [...centerLines(l.kitchen, w)];
  if (ctx.copy) rows.push(...centerLines(sanitize(l.copy), w));
  rows.push(...meta({ ...order, notes: null }, w, l), rule(w));
  for (const item of items) {
    rows.push(...wrap(`${item.qty}x ${sanitize(item.name)}`, w));
    for (const m of item.modifiers) rows.push(...textRows(m, w, "  + "));
    rows.push(...textRows(item.note, w, "  ! "));
  }
  rows.push(rule(w));
  return rows;
}
