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
  label: string;
  title: string;
  icon: LucideIcon;
  /** Shown in the phone bottom bar; the rest go into the "Lainnya" sheet. */
  primary: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { view: "kasir", label: "Kasir", title: "Kasir", icon: ShoppingCart, primary: true },
  { view: "riwayat", label: "Riwayat", title: "Riwayat Order", icon: ReceiptText, primary: true },
  { view: "laporan", label: "Laporan", title: "Laporan Penjualan", icon: BarChart3, primary: true },
  { view: "menu", label: "Menu", title: "Menu & Harga", icon: BookOpen, primary: false },
  { view: "stok", label: "Stok", title: "Bahan & Stok", icon: Package, primary: false },
  { view: "hpp", label: "HPP", title: "HPP & Margin", icon: Calculator, primary: false },
  { view: "backup", label: "Backup", title: "Backup & Sync", icon: CloudUpload, primary: false },
  { view: "pengaturan", label: "Setelan", title: "Pengaturan", icon: Settings, primary: false },
];

export function navItemFor(view: View): NavItem {
  return NAV_ITEMS.find((item) => item.view === view) ?? NAV_ITEMS[0];
}
