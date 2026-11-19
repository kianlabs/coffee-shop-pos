import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { MoneyInput } from "@/components/MoneyInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NewVariantFormProps {
  productId: string;
  onAdd: (productId: string, name: string, priceDeltaRp: number) => Promise<boolean>;
}

export function NewVariantForm({ productId, onAdd }: NewVariantFormProps) {
  const [name, setName] = useState("");
  const [delta, setDelta] = useState(0);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() === "" || saving) return;
    setSaving(true);
    const ok = await onAdd(productId, name, delta);
    setSaving(false);
    if (!ok) return;
    setName("");
    setDelta(0);
  }

  return (
    <form
      className="grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end"
      onSubmit={(e) => void handleSubmit(e)}
      data-testid="variant-add-form"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="new-variant-name">Varian baru</Label>
        <Input
          id="new-variant-name"
          placeholder="mis. Large"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="new-variant-delta">Tambahan harga</Label>
        <MoneyInput
          id="new-variant-delta"
          placeholder="+Rp"
          value={delta}
          allowEmpty
          allowNegative
          onChange={setDelta}
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        data-testid="variant-add"
        loading={saving}
        disabled={name.trim() === ""}
      >
        <Plus aria-hidden />
        Varian
      </Button>
    </form>
  );
}
