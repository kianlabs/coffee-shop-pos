import { Calculator, Clock, Info, Lock, Printer, Store, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export type SectionId = "toko" | "kasir" | "shift" | "printer" | "keamanan" | "tentang";

interface SectionSpec {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  /** True when the section edits the draft saved by "Simpan pengaturan". */
  usesSave: boolean;
}

export const SECTIONS: readonly SectionSpec[] = [
  { id: "toko", label: "Toko", icon: Store, usesSave: true },
  { id: "kasir", label: "Kasir", icon: Calculator, usesSave: true },
  { id: "shift", label: "Shift", icon: Clock, usesSave: false },
  { id: "printer", label: "Printer", icon: Printer, usesSave: false },
  { id: "keamanan", label: "Keamanan", icon: Lock, usesSave: true },
  { id: "tentang", label: "Tentang", icon: Info, usesSave: false },
];

interface SectionNavProps {
  vertical: boolean;
}

/** Side list on ≥1024 px; a 3- or 6-column grid of tabs on smaller screens. */
export function SectionNav({ vertical }: SectionNavProps) {
  return (
    <TabsList
      aria-label="Bagian pengaturan"
      className={cn(
        "h-auto gap-1",
        vertical ? "sticky top-0 w-52 shrink-0" : "grid w-full grid-cols-3 sm:grid-cols-6",
      )}
    >
      {SECTIONS.map(({ id, label, icon: Icon }) => (
        <TabsTrigger key={id} value={id} className="h-11 min-w-0 px-3" data-testid={`settings-tab-${id}`}>
          <Icon aria-hidden />
          <span className="truncate">{label}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
