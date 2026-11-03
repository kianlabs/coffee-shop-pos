import { formatRupiah } from "../domain/money";
import type { Order } from "../domain/orders";

const WIDTH = 32;

function line(left: string, right: string): string {
  const gap = Math.max(1, WIDTH - left.length - right.length);
  return left + " ".repeat(gap) + right;
}

export function renderReceiptText(order: Order): string {
  const rows: string[] = [];
  rows.push("KOPI POS".padStart(20));
  rows.push(`No: ${order.receiptNumber}`);
  rows.push(`Tgl: ${new Date(order.createdAt).toLocaleString("id-ID")}`);
  rows.push("-".repeat(WIDTH));
  for (const l of order.lines) {
    const variant = l.variantName ? ` (${l.variantName})` : "";
    rows.push(`${l.productName}${variant} x${l.qty}`);
    rows.push(line(`  @${formatRupiah(l.unitPriceRp)}`, formatRupiah(l.lineTotalRp)));
  }
  rows.push("-".repeat(WIDTH));
  rows.push(line("Subtotal", formatRupiah(order.subtotalRp)));
  if (order.discountRp > 0) {
    rows.push(line("Diskon", "-" + formatRupiah(order.discountRp)));
  }
  if (order.taxRp > 0) {
    rows.push(line("Pajak", formatRupiah(order.taxRp)));
  }
  rows.push(line("TOTAL", formatRupiah(order.totalRp)));
  rows.push(line(order.payment.method === "cash" ? "Tunai" : "QRIS", formatRupiah(order.payment.amountRp)));
  rows.push(line("Kembalian", formatRupiah(order.changeRp)));
  rows.push("-".repeat(WIDTH));
  rows.push("Terima kasih".padStart(22));
  rows.push(`ID: ${order.id.slice(0, 8)}`);
  return rows.join("\n");
}

export function printReceipt(order: Order): void {
  const win = window.open("", "_blank", "width=320,height=600");
  if (!win) {
    return;
  }
  const escaped = renderReceiptText(order)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  win.document.write(
    `<!doctype html><html><head><title>${order.receiptNumber}</title></head>` +
      `<body><pre style="font-family:monospace;font-size:12px;width:58mm;white-space:pre-wrap;">${escaped}</pre>` +
      `<script>window.onload=function(){window.print();}</script></body></html>`,
  );
  win.document.close();
}
