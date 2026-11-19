import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { MoneyInput } from "@/components/MoneyInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductVariant } from "@/domain/catalog";
import { formatRupiah } from "@/domain/money";
import type { VariantPatch } from "./useCatalogEditor";

interface VariantRowProps {
  variant: ProductVariant;
  productName: string;
  basePrice: number;
  busy: boolean;
  onSave: (id: string, patch: VariantPatch) => Promise<boolean>;
  onRemove: (variant: ProductVariant) => Promise<boolean>;
}

/** Name and price delta save on blur, as in the old editor. */
export function VariantRow({ variant, productName, basePrice, busy, onSave, onRemove }: VariantRowProps) {
  const [name, setName] = useState(variant.name);
  const [delta, setDelta] = useState(variant.priceDeltaRp);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setName(variant.name);
    setDelta(variant.priceDeltaRp);
  }, [variant.name, variant.priceDeltaRp]);

  function saveName() {
    const next = name.trim();
    if (!next) {
      setName(variant.name);
      return;
    }
    if (next !== variant.name) void onSave(variant.id, { name: next });
  }

  function saveDelta() {
    if (delta !== variant.priceDeltaRp) void onSave(variant.id, { priceDeltaRp: delta });
  }

  const nameId = `variant-name-${variant.id}`;
  const deltaId = `variant-delta-${variant.id}`;
  return (
    <li className="grid gap-2 rounded-md border p-3" data-testid="variant-row">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <div className="grid gap-1.5">
          <Label htmlFor={nameId}>Nama varian</Label>
          <Input
            id={nameId}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={deltaId}>Selisih harga</Label>
          <MoneyInput id={deltaId} value={delta} allowNegative onChange={setDelta} onBlur={saveDelta} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground tabular-nums">
          Harga di kasir: {formatRupiah(basePrice + delta)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive"
          aria-label={`Hapus varian ${variant.name}`}
          disabled={busy}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 />
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Hapus varian "${variant.name}"?`}
        description={`Varian "${variant.name}" pada menu "${productName}" tidak muncul lagi di kasir. Riwayat transaksi lama tetap utuh.`}
        confirmLabel="Hapus varian"
        destructive
        onConfirm={() => void onRemove(variant)}
      />
    </li>
  );
}
