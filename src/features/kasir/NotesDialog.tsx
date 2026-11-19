import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCartStore } from "@/stores/cartStore";

const QUICK_NOTES = ["Less sugar", "No sugar", "Less ice", "Extra shot", "Panas", "Dingin", "Pisah kantong"];
const MAX_NOTE = 1000;

interface NotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function appendNote(current: string, preset: string): string {
  const trimmed = current.trim();
  if (!trimmed) return preset;
  if (trimmed.includes(preset)) return current;
  return `${trimmed}, ${preset}`;
}

export function NotesDialog({ open, onOpenChange }: NotesDialogProps) {
  const notes = useCartStore((s) => s.notes);
  const setNotes = useCartStore((s) => s.setNotes);
  const [draft, setDraft] = useState(notes);

  function handleOpenChange(next: boolean) {
    if (next) setDraft(notes);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Catatan pesanan</DialogTitle>
          <DialogDescription>Dicetak di struk. Ketuk pilihan cepat untuk menambah.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="cart-notes">Catatan</Label>
          <Textarea
            id="cart-notes"
            value={draft}
            maxLength={MAX_NOTE}
            rows={3}
            placeholder="Contoh: meja 4, tanpa es"
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <div role="group" aria-label="Catatan cepat" className="flex flex-wrap gap-2">
          {QUICK_NOTES.map((preset) => (
            <Button key={preset} variant="outline" size="sm" onClick={() => setDraft((d) => appendNote(d, preset))}>
              <Plus /> {preset}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button
            onClick={() => {
              setNotes(draft);
              onOpenChange(false);
            }}
          >
            Simpan catatan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
