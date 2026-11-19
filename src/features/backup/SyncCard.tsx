import { Check, Cloud, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_SYNC_ENDPOINT } from "@/data/sync";
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
        title="Sync ke server"
        description="Opsional: kirim data penjualan ke server untuk rekap online atau banyak perangkat. Kasir tetap jalan tanpa internet."
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
            <Label htmlFor="sync-endpoint">Endpoint</Label>
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
            <Label htmlFor="sync-apikey">API key</Label>
            <PasswordInput
              id="sync-apikey"
              value={settings.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              aria-describedby="sync-apikey-hint"
              data-testid="sync-apikey-input"
            />
            <p id="sync-apikey-hint" className="text-sm text-muted-foreground">
              API key hanya disimpan selama aplikasi terbuka dan hilang saat aplikasi ditutup.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row md:col-span-2">
            <Button type="submit" variant="outline" data-testid="sync-save-btn">
              <Check aria-hidden />
              Simpan
            </Button>
            <Button
              type="button"
              loading={syncing}
              onClick={() => void runSync()}
              data-testid="sync-now-btn"
            >
              {!syncing && <RefreshCw aria-hidden />}
              {syncing ? "Sync…" : "Sync sekarang"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
