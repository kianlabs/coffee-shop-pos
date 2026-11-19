import { TrendingDown } from "lucide-react";
import { cn } from "cn";
import { formatPct, type MarginInfo } from "@/domain/hppResolve";
import { formatRupiah } from "@/domain/money";
import { t } from "@/services/i18n";

interface MarginValuesProps {
  priceRp: number;
  hppRp: number;
  margin: MarginInfo;
  /** "row": labels move to the list header from lg up. "stack": labels always visible. */
  layout?: "row" | "stack";
}

export function MarginValues({ priceRp, hppRp, margin, layout = "row" }: MarginValuesProps) {
  const loss = margin.profitRp < 0;
  const row = layout === "row";
  const dt = cn("text-muted-foreground", row && "lg:sr-only");
  return (
    <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4", row && "lg:contents")}>
      <div className="min-w-0">
        <dt className={dt}>{t("hpp.price.label")}</dt>
        <dd>{formatRupiah(priceRp)}</dd>
      </div>
      <div className="min-w-0">
        <dt className={dt}>{t("hpp.cost.label")}</dt>
        <dd className="font-medium">{formatRupiah(hppRp)}</dd>
      </div>
      <div className="min-w-0">
        <dt className={dt}>{t("hpp.profit.label")}</dt>
        <dd className={cn("font-medium", loss && "flex flex-wrap items-center gap-1 text-destructive")}>
          {loss && <TrendingDown className="size-4 shrink-0" aria-hidden />}
          {formatRupiah(margin.profitRp)}
          {loss && <span className="text-xs">{t("hpp.loss.badge")}</span>}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className={dt}>{t("hpp.margin.label")}</dt>
        <dd className={cn(loss && "text-destructive")}>{formatPct(margin.marginPct)}</dd>
      </div>
    </dl>
  );
}
