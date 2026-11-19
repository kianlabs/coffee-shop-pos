import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { cn } from "cn";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { t } from "@/services/i18n";
import { NAV_ITEMS, type NavItem, type View } from "./navigation";
import { useNavBadges } from "./useNavBadges";
import { NavBadge } from "./NavBadge";

interface MobileNavProps {
  view: View;
  onNavigate: (view: View) => void;
}

const PRIMARY = NAV_ITEMS.filter((item) => item.primary);
const SECONDARY = NAV_ITEMS.filter((item) => !item.primary);

const itemClass =
  "relative flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium outline-none focus-visible:bg-accent";

/** Phone bottom bar (< 768 px): main screens plus a "Lainnya" sheet for the rest. */
export function MobileNav({ view, onNavigate }: MobileNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const badges = useNavBadges();
  const secondaryActive = SECONDARY.some((item) => item.view === view);

  function go(next: View) {
    setMoreOpen(false);
    onNavigate(next);
  }

  return (
    <nav
      aria-label={t("app.nav.ariaLabel")}
      data-testid="mobile-nav"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {PRIMARY.map((item) => (
        <MobileNavButton key={item.view} item={item} active={item.view === view} onClick={go} />
      ))}
      <button
        type="button"
        data-testid="nav-more"
        aria-current={secondaryActive ? "page" : undefined}
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen(true)}
        className={cn(itemClass, secondaryActive ? "text-foreground" : "text-muted-foreground")}
      >
        <LayoutGrid className="size-5" aria-hidden />
        {t("app.nav.more")}
        <NavBadge count={badges.backup} className="absolute top-1 right-[calc(50%-1.25rem)]" />
      </button>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-xl pb-[env(safe-area-inset-bottom)]">
          <SheetHeader>
            <SheetTitle>{t("app.nav.moreTitle")}</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4 pb-4">
            {SECONDARY.map((item) => (
              <MoreItem key={item.view} item={item} active={item.view === view} onClick={go} />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

interface ItemProps {
  item: NavItem;
  active: boolean;
  onClick: (view: View) => void;
}

function MobileNavButton({ item, active, onClick }: ItemProps) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      data-testid="nav-item"
      aria-current={active ? "page" : undefined}
      onClick={() => onClick(item.view)}
      className={cn(itemClass, active ? "text-foreground" : "text-muted-foreground")}
    >
      <Icon className={cn("size-5", active && "stroke-[2.5]")} aria-hidden />
      <span data-testid="nav-label">{t(item.labelKey)}</span>
    </button>
  );
}

function MoreItem({ item, active, onClick }: ItemProps) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      data-testid="nav-item"
      aria-current={active ? "page" : undefined}
      onClick={() => onClick(item.view)}
      className={cn(
        "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border text-sm font-medium",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
      )}
    >
      <Icon className="size-5" aria-hidden />
      <span data-testid="nav-label">{t(item.labelKey)}</span>
    </button>
  );
}
