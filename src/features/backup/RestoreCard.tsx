import { useState } from "react";
import { AlertTriangle, Upload } from "lucide-react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/services/i18n";
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
      ? t("backup.restore.confirmDescription", { jumlah: step.currentCount, nama: step.fileName })
      : lastConfirm;
  if (confirmText !== lastConfirm) setLastConfirm(confirmText);

  return (
    <Card role="region" aria-labelledby="restore-title" className="gap-4">
      <SectionHeader
        id="restore-title"
        icon={Upload}
        title={t("backup.restore.title")}
        description={t("backup.restore.description")}
      />
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2 rounded-md bg-warning-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            <strong>{t("backup.restore.warningLead")}</strong>{" "}
            {t("backup.restore.warningBefore")}{" "}
            <strong>{t("backup.restore.warningEmphasis")}</strong>{" "}
            {t("backup.restore.warningAfter")}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="restore-file">{t("backup.restore.fileLabel")}</Label>
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
              {t("backup.restore.restoring")}
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
        title={t("backup.restore.confirmTitle")}
        description={confirmText}
        confirmLabel={t("backup.restore.confirmLabel")}
        destructive
        onConfirm={() => void flow.confirmRestore()}
      />
    </Card>
  );
}
