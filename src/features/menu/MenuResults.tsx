import { Coffee, Plus, SearchX } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
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
        title="Belum ada menu"
        description="Daftar menu masih kosong. Tambahkan menu pertama beserta harganya, layar kasir langsung menampilkannya."
        action={
          <Button data-testid="menu-add-first" onClick={onAddFirst}>
            <Plus aria-hidden />
            Tambah menu pertama
          </Button>
        }
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="Menu tidak ditemukan"
        description="Coba kata kunci atau kategori lain."
        action={
          <Button variant="outline" onClick={onClearFilters}>
            Hapus pencarian
          </Button>
        }
      />
    );
  }
  return <ProductList rows={rows} onOpen={onOpen} />;
}
