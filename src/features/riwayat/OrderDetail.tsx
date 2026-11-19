import { formatRupiah, type Rupiah } from "@/domain/money";
import { type Order } from "@/domain/orders";
import { t } from "@/services/i18n";

interface OrderDetailProps {
  order: Order;
  id: string;
}

interface TotalRowProps {
  label: string;
  value: string;
  strong?: boolean;
}

function TotalRow({ label, value, strong = false }: TotalRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
      <dd className={strong ? "font-semibold" : "font-medium"}>{value}</dd>
    </div>
  );
}

function optionalRows(order: Order): Array<[string, Rupiah, string]> {
  const rows: Array<[string, Rupiah, string]> = [];
  if (order.discountRp > 0) rows.push([t("riwayat.detail.discount"), order.discountRp, "−"]);
  if (order.taxRp > 0) rows.push([t("riwayat.detail.tax"), order.taxRp, ""]);
  if (order.serviceChargeRp > 0) {
    rows.push([t("riwayat.detail.service"), order.serviceChargeRp, ""]);
  }
  if (order.roundingRp !== 0) rows.push([t("riwayat.detail.rounding"), order.roundingRp, ""]);
  return rows;
}

export function OrderDetail({ order, id }: OrderDetailProps) {
  return (
    <div id={id} className="grid gap-4 border-t pt-3 text-sm md:grid-cols-2">
      <ul
        className="grid content-start gap-2"
        aria-label={t("riwayat.detail.itemsLabel", { receipt: order.receiptNumber })}
      >
        {order.lines.map((line, index) => (
          <li key={`${order.id}-${index}`} className="flex flex-wrap justify-between gap-x-3">
            <span className="min-w-0 break-words">
              {line.productName}
              {line.variantName ? ` · ${line.variantName}` : ""}
            </span>
            <span className="text-muted-foreground">
              {line.qty} × {formatRupiah(line.unitPriceRp)} ={" "}
              <strong className="text-foreground">{formatRupiah(line.lineTotalRp)}</strong>
            </span>
          </li>
        ))}
      </ul>
      <dl className="grid content-start gap-1.5 rounded-md bg-muted p-3">
        <TotalRow label={t("riwayat.detail.subtotal")} value={formatRupiah(order.subtotalRp)} />
        {optionalRows(order).map(([label, value, prefix]) => (
          <TotalRow key={label} label={label} value={`${prefix}${formatRupiah(value)}`} />
        ))}
        <TotalRow label={t("riwayat.detail.total")} value={formatRupiah(order.totalRp)} strong />
        <TotalRow label={t("riwayat.detail.paid")} value={formatRupiah(order.payment.amountRp)} />
        <TotalRow label={t("riwayat.detail.change")} value={formatRupiah(order.changeRp)} />
      </dl>
      {order.notes && (
        <p className="break-words text-muted-foreground md:col-span-2">
          {t("riwayat.detail.notes", { notes: order.notes })}
        </p>
      )}
    </div>
  );
}
