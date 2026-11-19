import { cn } from "cn";

interface NavBadgeProps {
  count: number | undefined;
  className?: string;
}

export function NavBadge({ count, className }: NavBadgeProps) {
  if (!count || count <= 0) return null;
  return (
    <span
      className={cn(
        "min-w-5 rounded-full bg-destructive px-1.5 text-center text-[11px] leading-5 font-semibold text-white tabular-nums",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
