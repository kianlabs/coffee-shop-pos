import { CloudDownload, Clock, Printer, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "cn";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";
import { navItemFor } from "./navigation";

type Tone = "ok" | "warn" | "neutral";

const TONES: Record<Tone, string> = {
  ok: "border-success/20 bg-success-soft text-success",
  warn: "border-warning/25 bg-warning-soft text-warning",
  neutral: "border-border bg-card text-muted-foreground",
};

interface StatusPillProps {
  tone: Tone;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

function StatusPill({ tone, icon, children, className, onClick }: StatusPillProps) {
  const classes = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5",
    TONES[tone],
    onClick && "hover:bg-accent",
    className,
  );
  if (!onClick) return <span className={classes}>{icon}{children}</span>;
  return (
    <button type="button" className={classes} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

const todayLabel = () =>
  new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });

export function TopBar() {
  const view = useAppStore((s) => s.view);
  const storeName = useAppStore((s) => s.storeProfile.name);
  const online = useAppStore((s) => s.online);
  const shift = useAppStore((s) => s.shift);
  const pending = useAppStore((s) => s.pendingCount);
  const printer = useAppStore((s) => s.printer);
  const update = useAppStore((s) => s.availableUpdate);
  const setView = useAppStore((s) => s.setView);
  const openUpdate = useAppStore((s) => s.setUpdateDialogOpen);

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card px-4 md:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg leading-tight font-semibold">{t(navItemFor(view).titleKey)}</h1>
        <p className="truncate text-xs text-muted-foreground">
          {storeName} · {todayLabel()}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {update && (
          <StatusPill tone="neutral" icon={<CloudDownload />} onClick={() => openUpdate(true)}>
            {t("app.topbar.updateAvailable", { versi: update.version })}
          </StatusPill>
        )}
        <StatusPill tone={online ? "ok" : "warn"} icon={online ? <Wifi /> : <WifiOff />}>
          {online ? t("app.status.online") : t("app.status.offline")}
        </StatusPill>
        <StatusPill tone={shift ? "ok" : "neutral"} icon={<Clock />} className="hidden lg:inline-flex">
          {shift
            ? t("app.topbar.shiftOpen", { kasir: shift.cashierName || t("app.topbar.cashierFallback") })
            : t("app.topbar.shiftClosed")}
        </StatusPill>
        {pending !== null && pending > 0 && (
          <StatusPill tone="warn" icon={<RefreshCw />} className="hidden lg:inline-flex">
            {t("app.topbar.pendingSync", { jumlah: pending })}
          </StatusPill>
        )}
        <StatusPill
          tone={printer.connected ? "ok" : "neutral"}
          icon={<Printer />}
          className="hidden sm:inline-flex"
          onClick={() => setView("pengaturan")}
        >
          {printer.connected
            ? (printer.name ?? t("app.topbar.printerFallback"))
            : t("app.topbar.printerNotConnected")}
        </StatusPill>
      </div>
    </header>
  );
}
