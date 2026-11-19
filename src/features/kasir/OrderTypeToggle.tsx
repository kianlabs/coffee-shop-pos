import { cn } from "cn";
import { useCartStore } from "@/stores/cartStore";
import { type OrderType } from "@/stores/cartTypes";

const OPTIONS: Array<{ value: OrderType; label: string }> = [
  { value: "dine-in", label: "Makan di tempat" },
  { value: "take-away", label: "Bawa pulang" },
];

export function OrderTypeToggle() {
  const orderType = useCartStore((s) => s.orderType);
  const setOrderType = useCartStore((s) => s.setOrderType);
  return (
    <div role="group" aria-label="Tipe pesanan" className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
      {OPTIONS.map((option) => {
        const active = option.value === orderType;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => setOrderType(option.value)}
            className={cn(
              "h-9 rounded-[calc(var(--radius)-2px)] text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
