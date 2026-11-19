import { PackagePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/services/i18n";

interface StokHeaderProps {
  count: number;
  onAdd: () => void;
  onPurchase: () => void;
}

export function StokHeader({ count, onAdd, onPurchase }: StokHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold">{t("stok.header.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("stok.header.description", { jumlah: count })}</p>
      </div>
      {count > 0 && (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={onAdd}>
            <Plus aria-hidden />
            {t("stok.addIngredient")}
          </Button>
          <Button className="flex-1 sm:flex-none" data-testid="stok-open-purchase" onClick={onPurchase}>
            <PackagePlus aria-hidden />
            {t("stok.purchase.button")}
          </Button>
        </div>
      )}
    </header>
  );
}
