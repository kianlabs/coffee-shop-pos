import { Calculator, Clock, Info, Lock, Printer, Store, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/services/i18n";

export type SectionId = "toko" | "kasir" | "shift" | "printer" | "keamanan" | "tentang";

interface SectionSpec {
  id: SectionId;
  /** Translation key for the tab label. */
  labelKey: string;
  icon: LucideIcon;
  /** True when the section edits the draft saved by "Simpan pengaturan". */
  usesSave: boolean;
}

export const SECTIONS: readonly SectionSpec[] = [
  { id: "toko", labelKey: "pengaturan.nav.store", icon: Store, usesSave: true },
  { id: "kasir", labelKey: "pengaturan.nav.cashier", icon: Calculator, usesSave: true },
  { id: "shift", labelKey: "pengaturan.nav.shift", icon: Clock, usesSave: false },
  { id: "printer", labelKey: "pengaturan.nav.printer", icon: Printer, usesSave: false },
  { id: "keamanan", labelKey: "pengaturan.nav.security", icon: Lock, usesSave: true },
  { id: "tentang", labelKey: "pengaturan.nav.about", icon: Info, usesSave: false },
];

interface SectionNavProps {
  vertical: boolean;
}

/** Side list on ≥1024 px; a 3- or 6-column grid of tabs on smaller screens. */
export function SectionNav({ vertical }: SectionNavProps) {
  return (
    <TabsList
      aria-label={t("pengaturan.nav.label")}
      className={cn(
        "h-auto gap-1",
        vertical ? "sticky top-0 w-52 shrink-0" : "grid w-full grid-cols-3 sm:grid-cols-6",
      )}
    >
      {SECTIONS.map(({ id, labelKey, icon: Icon }) => (
        <TabsTrigger key={id} value={id} className="h-11 min-w-0 px-3" data-testid={`settings-tab-${id}`}>
          <Icon aria-hidden />
          <span className="truncate">{t(labelKey)}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
