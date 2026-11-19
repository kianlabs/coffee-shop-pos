import { Download, Info, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { checkForAppUpdate } from "@/services/appUpdater";
import { t } from "@/services/i18n";
import { errorMessage, notify } from "@/lib/notify";
import { useAppStore } from "@/stores/appStore";
import { APP_VERSION, GITHUB_REPO } from "@/version";
import { SettingsSection } from "./SettingsSection";

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function AboutSection() {
  const availableUpdate = useAppStore((s) => s.availableUpdate);
  const setAvailableUpdate = useAppStore((s) => s.setAvailableUpdate);
  const setUpdateDialogOpen = useAppStore((s) => s.setUpdateDialogOpen);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleCheck() {
    setChecking(true);
    setMessage(t("pengaturan.about.checking"));
    try {
      const res = await checkForAppUpdate(GITHUB_REPO, APP_VERSION, true);
      if (res.hasUpdate && res.update) {
        setAvailableUpdate(res.update);
        setUpdateDialogOpen(true);
        setMessage(null);
        return;
      }
      setAvailableUpdate(null);
      setMessage(res.message || t("pengaturan.about.upToDate"));
    } catch (e) {
      const msg = errorMessage(e, t("pengaturan.about.checkFailed"));
      setMessage(msg);
      notify.error(msg);
    } finally {
      setChecking(false);
    }
  }

  return (
    <SettingsSection
      icon={Info}
      title={t("pengaturan.about.title")}
      description={t("pengaturan.about.description")}
      testId="settings-tentang"
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{t("pengaturan.about.version")}</dt>
        <dd className="text-right font-semibold" data-testid="app-version">v{APP_VERSION}</dd>
        <dt className="text-muted-foreground">{t("pengaturan.about.source")}</dt>
        <dd className="text-right">GitHub Releases</dd>
      </dl>
      {message && (
        <p className="rounded-md bg-info-soft p-3 text-sm" role="status" data-testid="update-status">
          {message}
        </p>
      )}
      {availableUpdate && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <p className="font-semibold">{t("pengaturan.about.updateAvailable", { tag: availableUpdate.tagName })}</p>
            <p className="text-sm text-muted-foreground">
              {t("pengaturan.about.size", { ukuran: formatMb(availableUpdate.sizeBytes) })}
            </p>
          </div>
          <Button type="button" onClick={() => setUpdateDialogOpen(true)}>
            <Download aria-hidden />
            {t("pengaturan.about.viewDetails")}
          </Button>
        </div>
      )}
      <Button type="button" variant="outline" className="w-full sm:w-fit" loading={checking} onClick={() => void handleCheck()}>
        {!checking && <RefreshCw aria-hidden />}
        {t("pengaturan.about.check")}
      </Button>
    </SettingsSection>
  );
}
