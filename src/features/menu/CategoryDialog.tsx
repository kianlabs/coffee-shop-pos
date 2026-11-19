import { useState, type FormEvent } from "react";
import { Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Category } from "@/domain/catalog";

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  productCounts: Map<string, number>;
  onAdd: (name: string) => Promise<boolean>;
}

export function CategoryDialog({
  open,
  onOpenChange,
  categories,
  productCounts,
  onAdd,
}: CategoryDialogProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() === "" || saving) return;
    setSaving(true);
    const ok = await onAdd(name);
    setSaving(false);
    if (ok) setName("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" data-testid="category-dialog">
        <DialogHeader>
          <DialogTitle>Kategori menu</DialogTitle>
          <DialogDescription>
            Kategori mengelompokkan menu di layar kasir.
          </DialogDescription>
        </DialogHeader>
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada kategori.</p>
        ) : (
          <ul className="divide-y rounded-md border" aria-label="Daftar kategori">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                <Tag className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {productCounts.get(c.id) ?? 0} menu
                </span>
              </li>
            ))}
          </ul>
        )}
        <form className="grid gap-2" onSubmit={(e) => void handleSubmit(e)}>
          <Label htmlFor="new-category-name">Nama kategori baru</Label>
          <div className="flex gap-2">
            <Input
              id="new-category-name"
              data-testid="new-category-name"
              placeholder="mis. Teh"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
            />
            <Button
              type="submit"
              data-testid="new-category-save"
              loading={saving}
              disabled={name.trim() === ""}
            >
              <Plus aria-hidden />
              Simpan
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
