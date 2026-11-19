import { useState } from "react";
import { Download, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { type BackupRecord } from "@/data/orderRepo";
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
        title="Backup file"
        description="Simpan salinan semua data (order, menu, HPP, stok, setelan) ke file. Lakukan minimal sekali sehari, misalnya saat tutup shift."
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
          Unduh backup
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
            Backup terenkripsi
          </h3>
          <p className="text-sm text-muted-foreground">
            File dikunci dengan passphrase, jadi aman disimpan di cloud. Tanpa passphrase, file
            tidak bisa dibuka.
          </p>
          <Label htmlFor="backup-passphrase">Passphrase</Label>
          <PasswordInput
            id="backup-passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="wajib untuk file .enc"
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
            Unduh .enc.json
          </Button>
        </form>
        <Separator />
        <BackupList backups={backups} />
      </CardContent>
    </Card>
  );
}
