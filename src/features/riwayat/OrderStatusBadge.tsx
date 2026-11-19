import { CircleCheck, CircleX, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type Order } from "@/domain/orders";
import { cn } from "cn";
import { statusLabel } from "./historyUtils";

interface OrderStatusBadgeProps {
  status: Order["status"];
}

const STYLES: Record<Order["status"], string> = {
  completed: "bg-success-soft text-success",
  voided: "bg-destructive/10 text-destructive",
  refunded: "bg-warning-soft text-warning",
};

const ICONS = { completed: CircleCheck, voided: CircleX, refunded: Undo2 } as const;

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const Icon = ICONS[status];
  return (
    <Badge variant="outline" className={cn("border-transparent", STYLES[status])}>
      <Icon aria-hidden />
      {statusLabel(status)}
    </Badge>
  );
}
