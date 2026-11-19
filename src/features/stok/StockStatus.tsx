import { CircleAlert, CircleCheck, CircleMinus } from "lucide-react";
import { cn } from "cn";

interface StockStatusProps {
  stockQty: number;
}

/**
 * Bahan tidak punya batas minimum, jadi status hanya membedakan minus,
 * habis, dan tersedia. Teks + ikon, tidak hanya warna.
 */
export function StockStatus({ stockQty }: StockStatusProps) {
  const status =
    stockQty < 0
      ? { Icon: CircleAlert, label: "Stok minus, lakukan koreksi", tone: "bg-destructive/10 text-destructive" }
      : stockQty === 0
        ? { Icon: CircleMinus, label: "Habis", tone: "bg-warning-soft text-warning" }
        : { Icon: CircleCheck, label: "Tersedia", tone: "bg-muted text-muted-foreground" };
  const { Icon } = status;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        status.tone,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {status.label}
    </span>
  );
}
