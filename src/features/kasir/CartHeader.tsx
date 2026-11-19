import { useState } from "react";
import { PauseCircle, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { notify } from "@/lib/notify";
import { useCartStore } from "@/stores/cartStore";

interface CartHeaderProps {
  itemCount: number;
  total: number;
}

export function CartHeader({ itemCount, total }: CartHeaderProps) {
  const hasItems = useCartStore((s) => s.lines.length > 0);
  const hold = useCartStore((s) => s.hold);
  const reset = useCartStore((s) => s.reset);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="flex items-center gap-2 border-b px-4 py-3">
      <h2 className="flex flex-1 items-center gap-2 text-base font-semibold">
        <ShoppingCart className="size-5" aria-hidden />
        Pesanan
        {itemCount > 0 && (
          <span className="rounded-full bg-muted px-2 text-sm font-medium tabular-nums">{itemCount}</span>
        )}
      </h2>
      {hasItems && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              hold(total);
              notify.info("Pesanan ditahan. Antrean berikutnya bisa dilayani.");
            }}
          >
            <PauseCircle /> Tahan
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
            <Trash2 /> Kosongkan
          </Button>
        </>
      )}
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Kosongkan pesanan?"
        description={`${itemCount} item, diskon, pajak, dan catatan di pesanan ini akan dihapus.`}
        confirmLabel="Kosongkan"
        destructive
        onConfirm={() => {
          reset();
          notify.info("Keranjang dikosongkan.");
        }}
      />
    </div>
  );
}
