import { formatRupiah } from "@/domain/money";
import { type TopProduct } from "@/domain/sales";
import { cn } from "cn";
import { ReportSection } from "./ReportSection";

interface TopProductsCardProps {
  products: TopProduct[];
}

export function TopProductsCard({ products }: TopProductsCardProps) {
  return (
    <ReportSection
      id="laporan-terlaris"
      title="Produk terlaris"
      description="10 menu dengan qty terbanyak di rentang ini."
    >
      <ol className="divide-y">
        {products.map((p, i) => (
          <li key={p.productId || `${p.productName}-${i}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span
              aria-hidden
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                i < 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.productName}</p>
              <p className="text-xs text-muted-foreground">
                {p.qty} terjual · laba {formatRupiah(p.profitRp)}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold">{formatRupiah(p.grossRp)}</span>
          </li>
        ))}
      </ol>
    </ReportSection>
  );
}
