import { cn } from "cn";
import { type HppProductView } from "@/data/productRepo";
import { t } from "@/services/i18n";
import { type HppLine } from "./hppModel";
import { HppProductItem } from "./HppProductItem";
import { HPP_GRID_COLS } from "./layout";

interface HppListProps {
  rows: HppProductView[];
  onEdit: (line: HppLine) => void;
  onRecipe: (line: HppLine) => void;
}

export function HppList({ rows, onEdit, onRecipe }: HppListProps) {
  return (
    <div className="lg:rounded-lg lg:border lg:bg-card">
      <div
        aria-hidden
        className={cn("hidden gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground lg:grid", HPP_GRID_COLS)}
      >
        <span>{t("hpp.column.product")}</span>
        <span>{t("hpp.price.label")}</span>
        <span>{t("hpp.cost.label")}</span>
        <span>{t("hpp.profit.label")}</span>
        <span>{t("hpp.margin.label")}</span>
        <span className="text-right">{t("hpp.action.label")}</span>
      </div>
      <ul className="grid gap-3 lg:gap-0 lg:[&>li:last-child]:border-b-0" aria-label={t("hpp.list.ariaLabel")}>
        {rows.map((p) => (
          <HppProductItem key={p.id} product={p} onEdit={onEdit} onRecipe={onRecipe} />
        ))}
      </ul>
    </div>
  );
}
