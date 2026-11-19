import { Clock, CloudUpload, Package, ShoppingCart, Undo2, type LucideIcon } from "lucide-react";
export interface HelpSectionDef {
  id: string;
  icon: LucideIcon;
  /** i18n prefix: `${prefix}.title`, `${prefix}.description`, `${prefix}.1..stepCount`. */
  prefix: string;
  stepCount: number;
}
export const HELP_SECTIONS: readonly HelpSectionDef[] = [
  { id: "cashier", icon: ShoppingCart, prefix: "bantuan.cashier", stepCount: 6 },
  { id: "shift", icon: Clock, prefix: "bantuan.shift", stepCount: 3 },
  { id: "refund", icon: Undo2, prefix: "bantuan.refund", stepCount: 4 },
  { id: "stock", icon: Package, prefix: "bantuan.stock", stepCount: 4 },
  { id: "backup", icon: CloudUpload, prefix: "bantuan.backup", stepCount: 4 },
];
