import { useState } from "react";
import { Download, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { type BackupRecord } from "@/data/orderRepo";
import { t } from "@/services/i18n";
import { BackupList } from "./BackupList";
import { PasswordInput } from "./PasswordInput";
import { SectionHeader } from "./SectionHeader";
import { useBackupActions } from "./useBackupActions";

interface BackupCardProps {
  backups: BackupRecord[];
  onSaved: () => void;
}

export function BackupCard({ backups, onSaved }: BackupCardProps) {
  const { busy, run } = useBackupActions(onSaved);
  const [passphrase, setPassphrase] = useState("");

  return (
    <Card role="region" aria-labelledby="backup-title" className="gap-4">
      <SectionHeader
        id="backup-title"
        icon={Download}
        title={t("backup.file.title")}
        description={t("backup.file.description")}
      />
      <CardContent className="flex flex-col gap-4">
        <Button
          className="w-full sm:w-fit"
          loading={busy === "plain"}
          disabled={busy !== null}
          onClick={() => void run("plain", "")}
          data-testid="backup-plain-btn"
        >
          <Download aria-hidden />
          {t("backup.plain.button")}
        </Button>
        <Separator />
        <form
          className="flex flex-col gap-2"
          aria-labelledby="backup-enc-title"
          onSubmit={(e) => {
            e.preventDefault();
            void run("encrypted", passphrase);
          }}
        >
          <h3 id="backup-enc-title" className="text-sm font-semibold">
            {t("backup.encrypted.title")}
          </h3>
          <p className="text-sm text-muted-foreground">{t("backup.encrypted.description")}</p>
          <Label htmlFor="backup-passphrase">{t("backup.passphrase.label")}</Label>
          <PasswordInput
            id="backup-passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder={t("backup.passphrase.placeholder")}
            data-testid="backup-passphrase-input"
          />
          <Button
            type="submit"
            variant="outline"
            className="w-full sm:w-fit"
            loading={busy === "encrypted"}
            disabled={busy !== null}
            data-testid="backup-encrypted-btn"
          >
            <Lock aria-hidden />
            {t("backup.encrypted.button")}
          </Button>
        </form>
        <Separator />
        <BackupList backups={backups} />
      </CardContent>
    </Card>
  );
}
