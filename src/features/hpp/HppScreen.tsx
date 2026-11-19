import { Calculator, RefreshCw, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { ScreenSkeleton } from "@/components/common/ScreenSkeleton";
import { Button } from "@/components/ui/button";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";
import { HppDialogs, type HppDialogState } from "./HppDialogs";
import { HppList } from "./HppList";
import { hppStats, type HppLine } from "./hppModel";
import { HppStats } from "./HppStats";
import { recipeTargetFor } from "./recipeTarget";
import { useHppData } from "./useHppData";

export function HppScreen() {
  const { native, rows, loading, loadFailed, reload, saveLine } = useHppData();
  const setView = useAppStore((s) => s.setView);
  const [dialog, setDialog] = useState<HppDialogState | null>(null);

  const openEdit = (line: HppLine) =>
    setDialog((prev) => ({ kind: "edit", line, open: true, seq: (prev?.seq ?? 0) + 1 }));
  const openRecipe = (line: HppLine) =>
    setDialog((prev) => ({ kind: "recipe", target: recipeTargetFor(line), open: true, seq: (prev?.seq ?? 0) + 1 }));

  if (!native) {
    return (
      <EmptyState
        icon={Calculator}
        title={t("hpp.native.title")}
        description={t("hpp.native.description")}
      />
    );
  }
  if (loading) return <ScreenSkeleton label={t("hpp.loading")} />;

  return (
    <div className="space-y-4" data-testid="hpp-screen">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{t("hpp.header.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("hpp.header.intro")} <strong>{t("hpp.mode.manual")}</strong> {t("hpp.header.manualDesc")}{" "}
          <strong>{t("hpp.mode.recipe")}</strong> {t("hpp.header.recipeDesc")}{" "}
          <strong>{t("hpp.mode.none")}</strong> {t("hpp.header.noneDesc")} {t("hpp.lock.note")}
        </p>
      </header>
      {rows.length > 0 && <HppStats {...hppStats(rows)} />}
      {loadFailed && rows.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title={t("hpp.loadFailed.title")}
          action={
            <Button variant="outline" onClick={() => void reload()}>
              <RefreshCw aria-hidden />
              {t("common.retry")}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title={t("hpp.empty.title")}
          description={t("hpp.empty.description")}
          action={<Button onClick={() => setView("menu")}>{t("hpp.empty.openMenu")}</Button>}
        />
      ) : (
        <HppList rows={rows} onEdit={openEdit} onRecipe={openRecipe} />
      )}
      <HppDialogs
        dialog={dialog}
        rows={rows}
        onOpenChange={(open) => setDialog((prev) => (prev ? { ...prev, open } : prev))}
        onSaveLine={saveLine}
        onOpenRecipe={openRecipe}
        onRecipeSaved={reload}
      />
    </div>
  );
}
