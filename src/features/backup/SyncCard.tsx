import { Check, Cloud, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_SYNC_ENDPOINT } from "@/data/sync";
import { t } from "@/services/i18n";
import { PasswordInput } from "./PasswordInput";
import { SectionHeader } from "./SectionHeader";
import { SyncStatus } from "./SyncStatus";
import { useSyncActions } from "./useSyncActions";

export function SyncCard() {
  const { settings, meta, syncing, update, save, runSync } = useSyncActions();

  return (
    <Card role="region" aria-labelledby="sync-title" className="gap-4 lg:col-span-2">
      <SectionHeader
        id="sync-title"
        icon={Cloud}
        title={t("backup.sync.title")}
        description={t("backup.sync.description")}
      />
      <CardContent className="flex flex-col gap-4">
        <SyncStatus meta={meta} />
        <form
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="sync-endpoint">{t("backup.sync.endpoint")}</Label>
            <Input
              id="sync-endpoint"
              value={settings.endpoint}
              onChange={(e) => update({ endpoint: e.target.value })}
              placeholder={DEFAULT_SYNC_ENDPOINT}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-testid="sync-endpoint-input"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sync-apikey">{t("backup.sync.apiKey")}</Label>
            <PasswordInput
              id="sync-apikey"
              value={settings.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              aria-describedby="sync-apikey-hint"
              data-testid="sync-apikey-input"
            />
            <p id="sync-apikey-hint" className="text-sm text-muted-foreground">
              {t("backup.sync.apiKeyHint")}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row md:col-span-2">
            <Button type="submit" variant="outline" data-testid="sync-save-btn">
              <Check aria-hidden />
              {t("backup.sync.save")}
            </Button>
            <Button
              type="button"
              loading={syncing}
              onClick={() => void runSync()}
              data-testid="sync-now-btn"
            >
              {!syncing && <RefreshCw aria-hidden />}
              {syncing ? t("backup.sync.syncing") : t("backup.sync.now")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
