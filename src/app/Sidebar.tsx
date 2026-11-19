import { cn } from "cn";
import { BrandMark } from "@/components/common/BrandMark";
import { KawungPattern } from "@/components/common/KawungPattern";
import { t } from "@/services/i18n";
import { NAV_ITEMS, type View } from "./navigation";
import { APP_NAME } from "./brand";
import { useNavBadges } from "./useNavBadges";
import { NavBadge } from "./NavBadge";

interface SidebarProps {
  view: View;
  onNavigate: (view: View) => void;
}

/** Icon rail for tablets (≥ 768 px). Every item shows an icon and a visible label. */
export function Sidebar({ view, onNavigate }: SidebarProps) {
  const badges = useNavBadges();
  return (
    <nav
      aria-label={t("app.nav.ariaLabel")}
      data-testid="nav"
      className="relative hidden w-22 shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground md:flex"
    >
      <KawungPattern className="text-sidebar-foreground opacity-[0.05]" />
      <div className="relative flex h-16 flex-col items-center justify-center gap-0.5" title={APP_NAME}>
        <BrandMark className="size-7 text-sidebar-active-foreground" />
        <span className="font-display text-[11px] leading-none font-bold tracking-wide text-sidebar-active-foreground">
          Suro
        </span>
        <span className="sr-only">{APP_NAME}</span>
      </div>
      <ul className="relative flex flex-1 flex-col gap-1 overflow-y-auto p-2" data-testid="nav-list">
        {NAV_ITEMS.map((item) => {
          const active = item.view === view;
          const Icon = item.icon;
          return (
            <li key={item.view}>
              <button
                type="button"
                data-testid="nav-item"
                aria-current={active ? "page" : undefined}
                onClick={() => onNavigate(item.view)}
                className={cn(
                  "relative flex w-full flex-col items-center gap-1 rounded-md px-1 py-2.5 text-xs font-medium transition-colors",
                  "outline-none focus-visible:ring-[3px] focus-visible:ring-sidebar-mark/60",
                  active
                    ? "bg-sidebar-active text-sidebar-active-foreground"
                    : "hover:bg-sidebar-active/50 hover:text-sidebar-active-foreground",
                )}
              >
                {active && (
                  <span className="absolute top-2 bottom-2 left-0 w-1 rounded-r-full bg-sidebar-mark" aria-hidden />
                )}
                <Icon className="size-5" aria-hidden />
                <span data-testid="nav-label">{t(item.labelKey)}</span>
                <NavBadge count={badges[item.view]} className="absolute top-1 right-2" />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
