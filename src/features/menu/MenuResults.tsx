import { Coffee, Plus, SearchX } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { t } from "@/services/i18n";
import type { ProductRowData } from "./catalogView";
import { ProductList } from "./ProductList";

interface MenuResultsProps {
  totalProducts: number;
  rows: ProductRowData[];
  onOpen: (productId: string) => void;
  onAddFirst: () => void;
  onClearFilters: () => void;
}

export function MenuResults({ totalProducts, rows, onOpen, onAddFirst, onClearFilters }: MenuResultsProps) {
  if (totalProducts === 0) {
    return (
      <EmptyState
        icon={Coffee}
        title={t("menu.results.emptyTitle")}
        description={t("menu.results.emptyDescription")}
        action={
          <Button data-testid="menu-add-first" onClick={onAddFirst}>
            <Plus aria-hidden />
            {t("menu.results.addFirst")}
          </Button>
        }
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("menu.results.notFoundTitle")}
        description={t("menu.results.notFoundDescription")}
        action={
          <Button variant="outline" onClick={onClearFilters}>
            {t("menu.search.clear")}
          </Button>
        }
      />
    );
  }
  return <ProductList rows={rows} onOpen={onOpen} />;
}
