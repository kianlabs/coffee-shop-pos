import { useState } from "react";
import { History } from "lucide-react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { formatRupiah } from "@/domain/money";
import { notify } from "@/lib/notify";
import { useCartStore } from "@/stores/cartStore";

export function HeldOrdersBar() {
  const held = useCartStore((s) => s.held);
  const hasItems = useCartStore((s) => s.lines.length > 0);
  const restore = useCartStore((s) => s.restore);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (held.length === 0) return null;

  function doRestore(id: string) {
    restore(id);
    notify.info("Pesanan yang ditahan dipulihkan ke keranjang.");
  }

  return (
    <div role="region" aria-label="Pesanan ditahan" className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2">
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <History className="size-3.5" aria-hidden />
        {held.length} ditahan
      </span>
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {held.map((h, index) => (
          <button
            key={h.id}
            type="button"
            title={`Ditahan pukul ${h.heldAt}`}
            onClick={() => (hasItems ? setPendingId(h.id) : doRestore(h.id))}
            className="h-9 shrink-0 rounded-md border bg-card px-3 text-sm font-medium tabular-nums hover:bg-accent"
          >
            #{index + 1} · {formatRupiah(h.total)}
          </button>
        ))}
      </div>
      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && setPendingId(null)}
        title="Ganti pesanan aktif?"
        description="Masih ada pesanan di keranjang. Pesanan itu akan diganti dengan pesanan yang ditahan."
        confirmLabel="Ganti pesanan"
        onConfirm={() => {
          if (pendingId) doRestore(pendingId);
          setPendingId(null);
        }}
      />
    </div>
  );
}
