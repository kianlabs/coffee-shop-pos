import { formatPct } from "@/domain/hppResolve";
import { formatRupiah } from "@/domain/money";
import { type PaymentBreakdownItem } from "@/domain/sales";
import { cn } from "cn";
import { paymentShares } from "./paymentMix";
import { ReportSection } from "./ReportSection";

interface PaymentMixCardProps {
  items: PaymentBreakdownItem[];
}

export function PaymentMixCard({ items }: PaymentMixCardProps) {
  const shares = paymentShares(items);
  return (
    <ReportSection
      id="laporan-metode-bayar"
      title="Metode bayar"
      description="Nominal transaksi bersih, bukan uang diterima."
    >
      <div data-testid="payment-mix-bar" aria-hidden className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {shares.map((p) => (
          <span key={p.method} className={cn("h-full", p.colorClass)} style={{ width: `${p.sharePct}%` }} />
        ))}
      </div>
      <ul className="divide-y">
        {shares.map((p) => (
          <li key={p.method} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <span aria-hidden className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", p.colorClass)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{p.label}</span>
                <span className="text-sm font-semibold">{formatRupiah(p.totalRp)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {p.orderCount} transaksi · {formatPct(p.sharePct)} dari omzet
              </p>
            </div>
          </li>
        ))}
      </ul>
    </ReportSection>
  );
}
