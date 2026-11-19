import { useState } from "react";
import { AlertTriangle, Upload } from "lucide-react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PassphraseDialog } from "./PassphraseDialog";
import { SectionHeader } from "./SectionHeader";
import { useRestoreFlow } from "./useRestoreFlow";

interface RestoreCardProps {
  onRestored: () => void;
}

export function RestoreCard({ onRestored }: RestoreCardProps) {
  const flow = useRestoreFlow(onRestored);
  const { step } = flow;
  // Keeps the dialog text stable during its close animation.
  const [lastConfirm, setLastConfirm] = useState("");
  const confirmText =
    step.kind === "confirm"
      ? `Restore akan MENIMPA ${step.currentCount} order yang ada di tablet ini dengan isi file ${step.fileName}. Tindakan ini tidak bisa dibatalkan.`
      : lastConfirm;
  if (confirmText !== lastConfirm) setLastConfirm(confirmText);

  return (
    <Card role="region" aria-labelledby="restore-title" className="gap-4">
      <SectionHeader
        id="restore-title"
        icon={Upload}
        title="Restore"
        description="Kembalikan data dari file backup, misalnya setelah ganti tablet atau data hilang."
      />
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2 rounded-md bg-warning-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            <strong>Perhatian:</strong> restore akan <strong>menimpa</strong> semua order yang ada
            di tablet ini. Pastikan file backup-nya benar.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="restore-file">Pilih file backup (.json / .enc.json)</Label>
          <Input
            id="restore-file"
            type="file"
            accept="application/json,.json,.enc.json"
            disabled={flow.restoring}
            aria-busy={flow.restoring || undefined}
            className="h-auto py-2"
            data-testid="restore-file-input"
            onChange={(e) => {
              void flow.pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {flow.restoring && (
            <p role="status" className="text-sm text-muted-foreground">
              Memulihkan data…
            </p>
          )}
        </div>
      </CardContent>
      {step.kind === "passphrase" && (
        <PassphraseDialog
          key={step.fileName}
          open
          fileName={step.fileName}
          loading={flow.decrypting}
          onSubmit={(pass) => void flow.submitPassphrase(pass)}
          onCancel={flow.cancelPassphrase}
        />
      )}
      <ConfirmDialog
        open={step.kind === "confirm"}
        onOpenChange={(open) => {
          if (!open) flow.cancelConfirm();
        }}
        title="Timpa data dengan backup?"
        description={confirmText}
        confirmLabel="Ya, restore"
        destructive
        onConfirm={() => void flow.confirmRestore()}
      />
    </Card>
  );
}
