import { Calculator, RefreshCw, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { ScreenSkeleton } from "@/components/common/ScreenSkeleton";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/appStore";
import { HppDialogs, type HppDialogState } from "./HppDialogs";
import { HppList } from "./HppList";
import { hppStats, type HppLine } from "./hppModel";
import { HppStats } from "./HppStats";
import { recipeTargetFor } from "./recipeTarget";
import { useHppData } from "./useHppData";

export function HppScreen() {
  const { native, rows, loading, loadFailed, reload, saveLine } = useHppData();
  const setView = useAppStore((s) => s.setView);
  const [dialog, setDialog] = useState<HppDialogState | null>(null);

  const openEdit = (line: HppLine) =>
    setDialog((prev) => ({ kind: "edit", line, open: true, seq: (prev?.seq ?? 0) + 1 }));
  const openRecipe = (line: HppLine) =>
    setDialog((prev) => ({ kind: "recipe", target: recipeTargetFor(line), open: true, seq: (prev?.seq ?? 0) + 1 }));

  if (!native) {
    return (
      <EmptyState
        icon={Calculator}
        title="HPP hanya tersedia di aplikasi Android"
        description="Layar ini membaca database SQLite tablet. Di browser (mode pratinjau), data HPP tidak tersedia. Buka aplikasi Android untuk mengatur HPP dan margin."
      />
    );
  }
  if (loading) return <ScreenSkeleton label="Memuat HPP…" />;

  return (
    <div className="space-y-4" data-testid="hpp-screen">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">HPP &amp; margin</h2>
        <p className="text-sm text-muted-foreground">
          Pilih sumber HPP per produk: <strong>Manual</strong> diisi sendiri, <strong>Resep</strong>{" "}
          dihitung dari bahan, atau <strong>Tanpa HPP</strong> bila tidak dilacak. HPP dikunci saat
          transaksi, jadi laporan laba lama tidak berubah ketika harga bahan naik.
        </p>
      </header>
      {rows.length > 0 && <HppStats {...hppStats(rows)} />}
      {loadFailed && rows.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="Gagal memuat data HPP"
          action={
            <Button variant="outline" onClick={() => void reload()}>
              <RefreshCw aria-hidden />
              Coba lagi
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Belum ada produk aktif"
          description="Tambahkan menu terlebih dahulu di layar Menu & Harga."
          action={<Button onClick={() => setView("menu")}>Buka Menu &amp; Harga</Button>}
        />
      ) : (
        <HppList rows={rows} onEdit={openEdit} onRecipe={openRecipe} />
      )}
      <HppDialogs
        dialog={dialog}
        rows={rows}
        onOpenChange={(open) => setDialog((prev) => (prev ? { ...prev, open } : prev))}
        onSaveLine={saveLine}
        onOpenRecipe={openRecipe}
        onRecipeSaved={reload}
      />
    </div>
  );
}
