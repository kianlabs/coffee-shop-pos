import { PackagePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StokHeaderProps {
  count: number;
  onAdd: () => void;
  onPurchase: () => void;
}

export function StokHeader({ count, onAdd, onPurchase }: StokHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold">Bahan &amp; stok</h2>
        <p className="text-sm text-muted-foreground">
          {count} bahan terdaftar. Catat pembelian supaya stok dan HPP resep ikut bergerak; harga
          per satuan terakhir dipakai sebagai HPP.
        </p>
      </div>
      {count > 0 && (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={onAdd}>
            <Plus aria-hidden />
            Tambah bahan
          </Button>
          <Button className="flex-1 sm:flex-none" data-testid="stok-open-purchase" onClick={onPurchase}>
            <PackagePlus aria-hidden />
            Catat pembelian
          </Button>
        </div>
      )}
    </header>
  );
}
