import { formatRupiah } from "../domain/money";
import type { Order, PaymentMethod } from "../domain/orders";

const WIDTH = 32;
const PRODUCT_NAME_MAX = 28;

// DEFAULT: ganti nama toko / lebar kolom di sini bila ganti kertas.
// WIDTH=32 untuk kertas 58mm; pakai 42 untuk 80mm.
const SHOP_NAME = "KOPI POS";
// DEFAULT: file logo raster belum ada. Bila `assets/logo.png` + plugin
// raster tersedia, isi logoText via opts (lihat printLogoPlaceholder di
// src/data/printer.ts). Tanpa file, template tetap jalan (tanpa logo).

export function line(left: string, right: string): string {
  if (left.length + right.length >= WIDTH) {
    const maxLeft = Math.max(1, WIDTH - right.length - 1);
    left = `${left.slice(0, Math.max(0, maxLeft - 1))}…`;
  }
  const gap = Math.max(1, WIDTH - left.length - right.length);
  return left + " ".repeat(gap) + right;
}

function center(text: string): string {
  if (text.length >= WIDTH) return text.slice(0, WIDTH);
  const pad = Math.floor((WIDTH - text.length) / 2);
  return " ".repeat(pad) + text;
}

function truncateName(name: string, max: number = PRODUCT_NAME_MAX): string {
  const clean = name.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  // Elipsis ASCII agar aman di ESC-POS CP437.
  return `${clean.slice(0, max - 3)}...`;
}

function fitWidth(text: string): string {
  if (text.length <= WIDTH) return text;
  return `${text.slice(0, WIDTH - 3)}...`;
}

function itemLine(name: string, variantName: string | null, qty: number): string {
  const suffix = `${variantName ? ` (${variantName})` : ""} x${qty}`;
  const room = Math.max(4, WIDTH - suffix.length);
  const head = truncateName(name, room);
  const full = `${head}${suffix}`;
  // Kalau varian + qty saja sudah melebihi lebar kertas, potong dari kiri
  // supaya angka qty (bukti jumlah) tidak pernah hilang.
  if (full.length <= WIDTH) return full;
  return full.slice(full.length - WIDTH);
}

export function paymentLabel(method: PaymentMethod): string {
  if (method === "cash") return "Tunai";
  if (method === "qris_manual") return "QRIS";
  return "Lainnya";
}

export type ReceiptOptions = {
  cashierName?: string;
  shiftName?: string;
  /** DEFAULT: override nama toko header (fallback SHOP_NAME bila kosong). */
  storeName?: string;
  /** Slot logo teks (mis. "[LOGO]"). Kosong = tanpa logo, tetap aman. */
  logoText?: string;
};

function extraRp(order: Order, key: "serviceChargeRp" | "roundingRp"): number {
  const v = order[key];
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
}

export function renderReceiptText(order: Order, opts?: ReceiptOptions): string {
  const rows: string[] = [];
  if (opts?.logoText) {
    rows.push(center(opts.logoText.slice(0, WIDTH)));
  }
  const shopName = opts?.storeName?.trim() ? opts.storeName.trim().slice(0, WIDTH) : SHOP_NAME;
  rows.push(center(shopName));
  if (order.status === "voided") {
    rows.push(center("*** VOID ***"));
  }
  if (order.status === "refunded") {
    rows.push(center("*** REFUND ***"));
  }
  rows.push(`No: ${order.receiptNumber}`);
  rows.push(`Tgl: ${new Date(order.createdAt).toLocaleString("id-ID")}`);
  if (opts?.cashierName) {
    rows.push(fitWidth(`Kasir: ${opts.cashierName}`));
  }
  if (opts?.shiftName) {
    rows.push(fitWidth(`Shift: ${opts.shiftName}`));
  }
  if (order.notes) {
    rows.push(fitWidth(`Ket: ${order.notes}`));
  }
  rows.push("-".repeat(WIDTH));
  for (const l of order.lines) {
    rows.push(itemLine(l.productName, l.variantName, l.qty));
    rows.push(line(`  @${formatRupiah(l.unitPriceRp)}`, formatRupiah(l.lineTotalRp)));
  }
  rows.push("-".repeat(WIDTH));
  rows.push(line("Subtotal", formatRupiah(order.subtotalRp)));
  if (order.discountRp > 0) {
    rows.push(line("Diskon", "-" + formatRupiah(order.discountRp)));
  }
  const serviceChargeRp = extraRp(order, "serviceChargeRp");
  if (serviceChargeRp > 0) {
    rows.push(line("Layanan", formatRupiah(serviceChargeRp)));
  }
  if (order.taxRp > 0) {
    rows.push(line("Pajak", formatRupiah(order.taxRp)));
  }
  const roundingRp = extraRp(order, "roundingRp");
  if (roundingRp !== 0) {
    const value =
      roundingRp > 0 ? formatRupiah(roundingRp) : "-" + formatRupiah(Math.abs(roundingRp));
    rows.push(line("Pembulatan", value));
  }
  rows.push(line("TOTAL", formatRupiah(order.totalRp)));
  rows.push(line(paymentLabel(order.payment.method), formatRupiah(order.payment.amountRp)));
  rows.push(line("Kembalian", formatRupiah(order.changeRp)));
  rows.push("-".repeat(WIDTH));
  if (order.status === "voided") {
    rows.push(center("*** VOID ***"));
  }
  if (order.status === "refunded") {
    rows.push(center("*** REFUND ***"));
  }
  rows.push("Terima kasih".padStart(22));
  rows.push(`ID: ${order.id.slice(0, 8)}`);
  return rows.join("\n");
}

// Export lama dipertahankan sebagai fallback WebPrinter bila PrinterPort gagal.
// Same-origin iframe (bukan window.open) — tanpa risiko open-redirect.
export function printReceipt(order: Order): void {
  const escaped = renderReceiptText(order)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("title", order.receiptNumber);
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(
    `<!doctype html><html><head><title>${order.receiptNumber.replace(/</g, "&lt;")}</title></head>` +
      `<body><pre style="font-family:monospace;font-size:12px;width:58mm;white-space:pre-wrap;">${escaped}</pre></body></html>`,
  );
  doc.close();
  const win = iframe.contentWindow;
  if (win) {
    win.focus();
    win.print();
  }
  window.setTimeout(() => iframe.remove(), 1000);
}
