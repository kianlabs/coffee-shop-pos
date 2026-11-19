import { Boxes, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { ScreenSkeleton } from "@/components/common/ScreenSkeleton";
import { Button } from "@/components/ui/button";
import { AdjustDialog } from "./AdjustDialog";
import { IngredientList } from "./IngredientList";
import { PurchaseDialog } from "./PurchaseDialog";
import { StokHeader } from "./StokHeader";
import { useStockData } from "./useStockData";

interface DialogState {
  kind: "purchase" | "adjust";
  ingredientId: string;
  open: boolean;
  /** Remounts the dialog so each opening starts with a fresh form. */
  seq: number;
}

/**
 * Layar Stok: satu-satunya tempat `recordPurchase` / `adjustStock` dipanggil
 * (lewat dialog pembelian dan koreksi). Konversi satuan kg↔g, l↔ml otomatis.
 */
export function StokScreen() {
  const { native, items, loading, loadFailed, reload } = useStockData();
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const openDialog = (kind: DialogState["kind"], ingredientId: string) =>
    setDialog((prev) => ({ kind, ingredientId, open: true, seq: (prev?.seq ?? 0) + 1 }));
  const setOpen = (open: boolean) => setDialog((prev) => (prev ? { ...prev, open } : prev));

  if (!native) {
    return (
      <EmptyState
        icon={Boxes}
        title="Stok hanya tersedia di aplikasi Android"
        description="Pembelian dan koreksi stok disimpan di database SQLite tablet. Di browser (mode pratinjau), layar ini tidak bisa dipakai. Buka aplikasi Android untuk mengelola bahan."
      />
    );
  }
  if (loading) return <ScreenSkeleton label="Memuat bahan…" />;

  return (
    <div className="space-y-4" data-testid="stok-screen">
      <StokHeader
        count={items.length}
        onAdd={() => openDialog("purchase", "")}
        onPurchase={() => openDialog("purchase", items[0]?.id ?? "")}
      />

      {loadFailed && items.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Gagal memuat bahan"
          action={
            <Button variant="outline" onClick={() => void reload()}>
              <RefreshCw aria-hidden />
              Coba lagi
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Belum ada bahan"
          description="Tambahkan bahan lewat pembelian pertama. Stok dan harga belinya langsung tercatat."
          action={
            <Button onClick={() => openDialog("purchase", "")} data-testid="stok-empty-add">
              <Plus aria-hidden />
              Tambah bahan
            </Button>
          }
        />
      ) : (
        <IngredientList
          items={items}
          onPurchase={(id) => openDialog("purchase", id)}
          onAdjust={(id) => openDialog("adjust", id)}
        />
      )}

      {dialog?.kind === "purchase" && (
        <PurchaseDialog
          key={dialog.seq}
          open={dialog.open}
          onOpenChange={setOpen}
          items={items}
          initialId={dialog.ingredientId}
          onSaved={reload}
        />
      )}
      {dialog?.kind === "adjust" && (
        <AdjustDialog
          key={dialog.seq}
          open={dialog.open}
          onOpenChange={setOpen}
          items={items}
          initialId={dialog.ingredientId}
          onSaved={reload}
        />
      )}
    </div>
  );
}
