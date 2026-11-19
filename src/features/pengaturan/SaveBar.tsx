import { Check, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}

/** Sits above the phone bottom navigation; at md+ it sticks to the bottom of the page. */
export function SaveBar({ dirty, saving, onSave }: SaveBarProps) {
  return (
    <div
      className="sticky bottom-[calc(var(--touch-min)+1px+env(safe-area-inset-bottom))] z-30 mt-4 flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between md:bottom-0"
      data-testid="settings-save-bar"
    >
      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        {dirty ? (
          <>
            <CircleDot className="size-4 shrink-0 text-warning" aria-hidden />
            Ada perubahan yang belum disimpan.
          </>
        ) : (
          "Perubahan berlaku setelah tombol simpan ditekan."
        )}
      </p>
      <Button type="button" className="w-full sm:w-auto" loading={saving} onClick={onSave} data-testid="settings-save">
        {!saving && <Check aria-hidden />}
        {saving ? "Menyimpan…" : "Simpan pengaturan"}
      </Button>
    </div>
  );
}
