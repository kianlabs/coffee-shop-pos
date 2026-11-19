import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { ScreenSkeleton } from "@/components/common/ScreenSkeleton";
import { Button } from "@/components/ui/button";
import { t } from "@/services/i18n";
import { MenuEditor } from "./MenuEditor";
import { useCatalogEditor } from "./useCatalogEditor";

export function MenuScreen() {
  const { catalog, status, busy, retry, actions } = useCatalogEditor();

  if (status === "loading") return <ScreenSkeleton label={t("menu.screen.loading")} />;
  if (status === "error") {
    return (
      <EmptyState
        icon={TriangleAlert}
        title={t("menu.screen.loadFailedTitle")}
        description={t("menu.screen.loadFailedDescription")}
        action={<Button onClick={() => void retry()}>{t("menu.common.retry")}</Button>}
      />
    );
  }
  return <MenuEditor catalog={catalog} busy={busy} actions={actions} />;
}
