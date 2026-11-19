import { useState } from "react";
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
import { PasswordInput } from "./PasswordInput";

interface PassphraseDialogProps {
  open: boolean;
  fileName: string;
  loading: boolean;
  onSubmit: (passphrase: string) => void;
  onCancel: () => void;
}

/** Asks for the passphrase of an encrypted backup file (replaces window.prompt). */
export function PassphraseDialog({ open, fileName, loading, onSubmit, onCancel }: PassphraseDialogProps) {
  const [passphrase, setPassphrase] = useState("");

  function handleOpenChange(next: boolean) {
    if (next || loading) return;
    setPassphrase("");
    onCancel();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="restore-passphrase-dialog">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(passphrase);
          }}
        >
          <DialogHeader>
            <DialogTitle>File backup terenkripsi</DialogTitle>
            <DialogDescription>
              Masukkan passphrase yang dipakai saat membuat {fileName}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="restore-passphrase">Passphrase</Label>
            <PasswordInput
              id="restore-passphrase"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoFocus
              data-testid="restore-passphrase-input"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => handleOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" loading={loading} data-testid="restore-passphrase-submit">
              Buka file
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
