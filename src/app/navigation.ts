import {
  BarChart3,
  BookOpen,
  Calculator,
  CloudUpload,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";

export type View =
  | "kasir"
  | "riwayat"
  | "laporan"
  | "menu"
  | "hpp"
  | "stok"
  | "backup"
  | "pengaturan";

export interface NavItem {
  view: View;
  /** i18n key for the short label under the icon. */
  labelKey: string;
  /** i18n key for the screen title in the top bar and document title. */
  titleKey: string;
  icon: LucideIcon;
  /** Shown in the phone bottom bar; the rest go into the "Lainnya" sheet. */
  primary: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { view: "kasir", labelKey: "app.nav.cashier", titleKey: "app.title.cashier", icon: ShoppingCart, primary: true },
  { view: "riwayat", labelKey: "app.nav.history", titleKey: "app.title.history", icon: ReceiptText, primary: true },
  { view: "laporan", labelKey: "app.nav.report", titleKey: "app.title.report", icon: BarChart3, primary: true },
  { view: "menu", labelKey: "app.nav.menu", titleKey: "app.title.menu", icon: BookOpen, primary: false },
  { view: "stok", labelKey: "app.nav.stock", titleKey: "app.title.stock", icon: Package, primary: false },
  { view: "hpp", labelKey: "app.nav.hpp", titleKey: "app.title.hpp", icon: Calculator, primary: false },
  { view: "backup", labelKey: "app.nav.backup", titleKey: "app.title.backup", icon: CloudUpload, primary: false },
  { view: "pengaturan", labelKey: "app.nav.settings", titleKey: "app.title.settings", icon: Settings, primary: false },
];

export function navItemFor(view: View): NavItem {
  return NAV_ITEMS.find((item) => item.view === view) ?? NAV_ITEMS[0];
}
