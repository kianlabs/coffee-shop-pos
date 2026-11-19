import { TrendingDown } from "lucide-react";
import { cn } from "cn";
import { formatPct, type MarginInfo } from "@/domain/hppResolve";
import { formatRupiah } from "@/domain/money";

interface RecipeSummaryProps {
  basePriceRp: number;
  totalPerUnit: number;
  margin: MarginInfo;
}

export function RecipeSummary({ basePriceRp, totalPerUnit, margin }: RecipeSummaryProps) {
  const loss = margin.profitRp < 0;
  return (
    <dl className="grid grid-cols-2 gap-3 rounded-md bg-muted p-3 text-sm sm:grid-cols-4" aria-live="polite" data-testid="recipe-summary">
      <div>
        <dt className="text-muted-foreground">Harga jual</dt>
        <dd>{formatRupiah(basePriceRp)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">HPP per unit</dt>
        <dd className="text-base font-semibold">{formatRupiah(totalPerUnit)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Laba / unit</dt>
        <dd className={cn("font-medium", loss && "flex flex-wrap items-center gap-1 text-destructive")}>
          {loss && <TrendingDown className="size-4" aria-hidden />}
          {formatRupiah(margin.profitRp)}
          {loss && <span className="text-xs">(rugi)</span>}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Margin</dt>
        <dd className={cn(loss && "text-destructive")}>{formatPct(margin.marginPct)}</dd>
      </div>
    </dl>
  );
}
