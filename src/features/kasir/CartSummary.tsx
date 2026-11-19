import { useState } from "react";
import { BadgePercent, Check, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/domain/money";
import { useCartStore } from "@/stores/cartStore";
import { type CartTotals } from "@/stores/useCartTotals";
import { AdjustmentsDialog } from "./AdjustmentsDialog";
import { NotesDialog } from "./NotesDialog";

interface CartSummaryProps {
  totals: CartTotals;
  onPay: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** Always-visible cart footer: totals, adjustments, and the Bayar button. */
export function CartSummary({ totals, onPay }: CartSummaryProps) {
  const notes = useCartStore((s) => s.notes.trim());
  const empty = useCartStore((s) => s.lines.length === 0);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const adjusted = totals.discount > 0 || totals.tax > 0;

  return (
    <div className="space-y-3 border-t bg-card p-4">
      <div className="space-y-1">
        <Row label="Subtotal" value={formatRupiah(totals.subtotal)} />
        {totals.discount > 0 && <Row label="Diskon" value={`−${formatRupiah(totals.discount)}`} />}
        {totals.tax > 0 && <Row label="Pajak" value={formatRupiah(totals.tax)} />}
        {totals.serviceCharge > 0 && <Row label="Biaya layanan" value={formatRupiah(totals.serviceCharge)} />}
        {totals.roundingRp !== 0 && <Row label="Pembulatan" value={formatRupiah(totals.roundingRp)} />}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" disabled={empty} onClick={() => setAdjustOpen(true)}>
          {adjusted ? <Check /> : <BadgePercent />} Diskon & pajak
        </Button>
        <Button variant="outline" size="sm" disabled={empty} onClick={() => setNotesOpen(true)} className="min-w-0">
          {notes ? <Check /> : <NotebookPen />}
          <span className="truncate">{notes ? `Catatan: ${notes}` : "Catatan"}</span>
        </Button>
      </div>
      <div className="flex items-baseline justify-between pt-1">
        <span className="text-sm font-medium">Total</span>
        <span className="text-2xl font-bold tracking-tight tabular-nums">{formatRupiah(totals.total)}</span>
      </div>
      <Button size="lg" className="h-14 w-full text-base" disabled={empty} onClick={onPay}>
        Bayar {formatRupiah(totals.total)}
      </Button>
      <AdjustmentsDialog open={adjustOpen} onOpenChange={setAdjustOpen} subtotal={totals.subtotal} />
      <NotesDialog open={notesOpen} onOpenChange={setNotesOpen} />
    </div>
  );
}
