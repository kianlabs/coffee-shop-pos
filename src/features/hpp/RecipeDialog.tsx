import { Boxes, Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/stores/appStore";
import { RecipeLines } from "./RecipeLines";
import { recipeLabel, type RecipeTarget } from "./recipeTarget";
import { useRecipeEditor } from "./useRecipeEditor";

interface RecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: RecipeTarget;
  onSaved: () => Promise<void>;
}

/**
 * Takaran diisi per 1 unit jual dalam satuan dasar bahan. Biaya memakai harga
 * beli terakhir, sama dengan resolver HPP saat checkout. Setiap simpan membuat
 * versi resep baru (lihat `saveRecipe`).
 */
export function RecipeDialog({ open, onOpenChange, target, onSaved }: RecipeDialogProps) {
  const editor = useRecipeEditor(target, onSaved);
  const setView = useAppStore((s) => s.setView);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const title = `Resep ${target.productName}${target.variantName ? ` · ${target.variantName}` : ""}`;
  const close = () => onOpenChange(false);

  const run = async (action: () => Promise<boolean>) => {
    if (await action()) close();
  };

  const empty = !editor.loading && editor.ingredients.length === 0;
  return (
    <Dialog open={open} onOpenChange={(next) => !editor.busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-testid="recipe-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {editor.version ? `Versi ${editor.version} aktif` : "Belum ada resep"} · takaran untuk 1 unit jual
          </DialogDescription>
        </DialogHeader>
        {editor.loading && <Skeleton className="h-32 w-full" aria-label="Memuat resep…" />}
        {empty && (
          <EmptyState
            icon={Boxes}
            title="Belum ada bahan"
            description="Tambahkan bahan dan harga belinya dulu di layar Stok, lalu kembali ke sini."
            action={<Button onClick={() => setView("stok")}>Buka Stok</Button>}
          />
        )}
        {!editor.loading && !empty && <RecipeLines editor={editor} basePriceRp={target.basePriceRp} />}
        {!editor.loading && !empty && (
          <DialogFooter className="gap-2">
            {editor.version !== null && (
              <Button variant="outline" className="text-destructive sm:mr-auto" disabled={editor.busy} onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden />
                Hapus resep
              </Button>
            )}
            <Button loading={editor.busy} disabled={!editor.canSave} onClick={() => void run(editor.save)} data-testid="recipe-save">
              <Check aria-hidden />
              Simpan resep
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Hapus resep?"
        description={`Resep ${recipeLabel(target)} akan dinonaktifkan. Riwayat versi resep tetap disimpan dan HPP di transaksi lama tidak berubah.`}
        confirmLabel="Hapus resep"
        destructive
        onConfirm={() => void run(editor.remove)}
      />
    </Dialog>
  );
}
