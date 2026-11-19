import { lazy, Suspense, useEffect, type ComponentType, type LazyExoticComponent } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScreenSkeleton } from "@/components/common/ScreenSkeleton";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";
import { KasirScreen } from "@/features/kasir/KasirScreen";
import { UpdateDialog } from "@/features/update/UpdateDialog";
import { APP_NAME } from "@/app/brand";
import { MobileNav } from "@/app/MobileNav";
import { navItemFor, type View } from "@/app/navigation";
import { Sidebar } from "@/app/Sidebar";
import { TopBar } from "@/app/TopBar";
import { useAppBootstrap } from "@/app/useAppBootstrap";

function lazyScreen<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
): LazyExoticComponent<ComponentType> {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

// Admin screens are rarely opened during rush hour, so they stay out of the
// initial bundle and the cashier screen appears faster on tablets.
const SCREENS: Record<Exclude<View, "kasir">, LazyExoticComponent<ComponentType>> = {
  riwayat: lazyScreen(() => import("@/features/riwayat/RiwayatScreen"), "RiwayatScreen"),
  laporan: lazyScreen(() => import("@/features/laporan/LaporanScreen"), "LaporanScreen"),
  menu: lazyScreen(() => import("@/features/menu/MenuScreen"), "MenuScreen"),
  hpp: lazyScreen(() => import("@/features/hpp/HppScreen"), "HppScreen"),
  stok: lazyScreen(() => import("@/features/stok/StokScreen"), "StokScreen"),
  backup: lazyScreen(() => import("@/features/backup/BackupScreen"), "BackupScreen"),
  pengaturan: lazyScreen(() => import("@/features/pengaturan/PengaturanScreen"), "PengaturanScreen"),
};

function CurrentScreen({ view }: { view: View }) {
  if (view === "kasir") return <KasirScreen />;
  const Screen = SCREENS[view];
  return (
    <Suspense fallback={<ScreenSkeleton label={t("app.screen.loading", { layar: t(navItemFor(view).titleKey) })} />}>
      <div className="mx-auto w-full max-w-6xl p-4 pb-24 md:p-6 md:pb-6">
        <Screen />
      </div>
    </Suspense>
  );
}

export default function App() {
  useAppBootstrap();
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);

  useEffect(() => {
    document.title = `${APP_NAME} — ${t(navItemFor(view).titleKey)}`;
  }, [view]);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <Sidebar view={view} onNavigate={setView} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="min-h-0 flex-1 overflow-y-auto" data-testid="main">
            <CurrentScreen view={view} />
          </main>
        </div>
        <MobileNav view={view} onNavigate={setView} />
      </div>
      <UpdateDialog />
      <Toaster position="top-center" richColors closeButton />
    </TooltipProvider>
  );
}
