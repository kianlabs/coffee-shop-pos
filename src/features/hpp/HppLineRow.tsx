import { BookOpen, Info, Pencil } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/domain/money";
import { HppSourceBadge } from "./HppSourceBadge";
import { lineLabel, type HppLine } from "./hppModel";
import { HPP_GRID_COLS } from "./layout";
import { MarginValues } from "./MarginValues";

interface HppLineRowProps {
  line: HppLine;
  subtitle: string;
  onEdit: (line: HppLine) => void;
  onRecipe: (line: HppLine) => void;
  /** Extra content under the name, e.g. the variant toggle. */
  children?: ReactNode;
}

export function HppLineRow({ line, subtitle, onEdit, onRecipe, children }: HppLineRowProps) {
  const label = lineLabel(line);
  const isVariant = line.kind === "variant";
  return (
    <div
      data-testid={isVariant ? "hpp-variant-row" : "hpp-product-row"}
      className={cn("grid gap-3 lg:items-center", HPP_GRID_COLS)}
    >
      <div className={cn("min-w-0 space-y-1", isVariant && "lg:pl-4")}>
        <p className={cn("truncate", isVariant ? "text-sm" : "font-medium")}>
          {isVariant ? line.variantName : line.productName}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {subtitle}
          {line.recipePerUnitRp !== null && ` · resep ${formatRupiah(line.recipePerUnitRp)}`}
        </p>
        <HppSourceBadge line={line} />
        {line.note && (
          <p className="flex items-start gap-1 text-xs text-warning">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {line.note}
          </p>
        )}
        {children}
      </div>
      <MarginValues priceRp={line.priceRp} hppRp={line.hppRp} margin={line.margin} />
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <Button variant="outline" size="sm" className="flex-1 lg:flex-none" aria-label={`Ubah HPP ${label}`} onClick={() => onEdit(line)}>
          <Pencil aria-hidden />
          Ubah HPP
        </Button>
        {line.mode === "recipe" && (
          <Button variant="outline" size="sm" className="flex-1 lg:flex-none" aria-label={`Atur resep ${label}`} onClick={() => onRecipe(line)}>
            <BookOpen aria-hidden />
            Atur resep
          </Button>
        )}
      </div>
    </div>
  );
}
