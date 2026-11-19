import { Store } from "lucide-react";
import { cn } from "cn";
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
      aria-label="Navigasi utama"
      data-testid="nav"
      className="hidden w-22 shrink-0 flex-col border-r bg-card md:flex"
    >
      <div className="flex h-16 items-center justify-center border-b">
        <span
          className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          title={APP_NAME}
        >
          <Store className="size-5" aria-hidden />
          <span className="sr-only">{APP_NAME}</span>
        </span>
      </div>
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-2" data-testid="nav-list">
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
                  "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span data-testid="nav-label">{item.label}</span>
                <NavBadge count={badges[item.view]} className="absolute top-1 right-2" />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
