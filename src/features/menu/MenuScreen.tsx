import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { ScreenSkeleton } from "@/components/common/ScreenSkeleton";
import { Button } from "@/components/ui/button";
import { MenuEditor } from "./MenuEditor";
import { useCatalogEditor } from "./useCatalogEditor";

export function MenuScreen() {
  const { catalog, status, busy, retry, actions } = useCatalogEditor();

  if (status === "loading") return <ScreenSkeleton label="Memuat menu…" />;
  if (status === "error") {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Menu gagal dimuat"
        description="Data menu di perangkat tidak bisa dibaca. Coba muat ulang."
        action={<Button onClick={() => void retry()}>Coba lagi</Button>}
      />
    );
  }
  return <MenuEditor catalog={catalog} busy={busy} actions={actions} />;
}
