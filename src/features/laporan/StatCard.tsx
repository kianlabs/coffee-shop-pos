import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "cn";

interface StatCardProps {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  sub: ReactNode;
  highlight?: boolean;
  valueClassName?: string;
  className?: string;
}

export function StatCard({ label, icon: Icon, value, sub, highlight, valueClassName, className }: StatCardProps) {
  return (
    <div
      data-testid="stat-card"
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-3 sm:p-4",
        highlight && "border-primary",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-sm leading-tight font-medium text-muted-foreground">{label}</span>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <div className={cn("text-lg leading-tight font-semibold [overflow-wrap:anywhere] sm:text-xl", valueClassName)}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
