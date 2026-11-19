import { BookOpen, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type HppProductView } from "@/data/productRepo";
import { type VariantHppMode } from "@/domain/hppResolve";
import { HppEditFields } from "./HppEditFields";
import { lineLabel, productLine, variantLine, type HppLine } from "./hppModel";
import { HppPreview } from "./HppPreview";

interface HppEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: HppLine;
  product: HppProductView;
  onSave: (line: HppLine, mode: VariantHppMode, manualRp: number) => Promise<boolean>;
  onOpenRecipe: (line: HppLine) => void;
}

export function HppEditDialog({ open, onOpenChange, line, product, onSave, onOpenRecipe }: HppEditDialogProps) {
  const [mode, setMode] = useState<VariantHppMode>(line.mode);
  const [manualRp, setManualRp] = useState(line.manualRp);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => {
    const variant = product.variants.find((v) => v.id === line.id);
    if (line.kind === "variant" && variant) return variantLine(product, variant, mode, manualRp);
    return productLine(product, mode === "inherit" ? product.mode : mode, manualRp);
  }, [product, line, mode, manualRp]);

  async function save(thenRecipe: boolean) {
    setBusy(true);
    let ok = false;
    try {
      ok = await onSave(line, mode, manualRp);
    } finally {
      setBusy(false);
    }
    if (!ok) return;
    onOpenChange(false);
    if (thenRecipe) onOpenRecipe(preview);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-testid="hpp-edit-dialog">
        <DialogHeader>
          <DialogTitle>Ubah HPP {lineLabel(line)}</DialogTitle>
          <DialogDescription>
            HPP dikunci saat transaksi, jadi laporan laba lama tidak berubah ketika harga bahan naik.
          </DialogDescription>
        </DialogHeader>
        <HppEditFields
          isVariant={line.kind === "variant"}
          mode={mode}
          manualRp={manualRp}
          disabled={busy}
          onModeChange={setMode}
          onManualChange={setManualRp}
        />
        <HppPreview line={preview} />
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          {mode === "recipe" && (
            <Button variant="outline" disabled={busy} onClick={() => void save(true)}>
              <BookOpen aria-hidden />
              Simpan &amp; atur resep
            </Button>
          )}
          <Button loading={busy} onClick={() => void save(false)} data-testid="hpp-edit-save">
            <Check aria-hidden />
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
