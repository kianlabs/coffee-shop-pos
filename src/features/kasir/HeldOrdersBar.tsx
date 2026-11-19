import { useState } from "react";
import { History } from "lucide-react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { formatRupiah } from "@/domain/money";
import { notify } from "@/lib/notify";
import { t } from "@/services/i18n";
import { useCartStore } from "@/stores/cartStore";

export function HeldOrdersBar() {
  const held = useCartStore((s) => s.held);
  const hasItems = useCartStore((s) => s.lines.length > 0);
  const restore = useCartStore((s) => s.restore);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (held.length === 0) return null;

  function doRestore(id: string) {
    restore(id);
    notify.info(t("kasir.held.restored"));
  }

  return (
    <div role="region" aria-label={t("kasir.held.region")} className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2">
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <History className="size-3.5" aria-hidden />
        {t("kasir.held.count", { count: held.length })}
      </span>
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {held.map((h, index) => (
          <button
            key={h.id}
            type="button"
            title={t("kasir.held.chipTitle", { time: h.heldAt })}
            onClick={() => (hasItems ? setPendingId(h.id) : doRestore(h.id))}
            className="h-9 shrink-0 rounded-md border bg-card px-3 text-sm font-medium tabular-nums hover:bg-accent"
          >
            {t("kasir.held.chip", { index: index + 1, amount: formatRupiah(h.total) })}
          </button>
        ))}
      </div>
      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && setPendingId(null)}
        title={t("kasir.held.replaceTitle")}
        description={t("kasir.held.replaceDescription")}
        confirmLabel={t("kasir.held.replaceConfirm")}
        onConfirm={() => {
          if (pendingId) doRestore(pendingId);
          setPendingId(null);
        }}
      />
    </div>
  );
}
