import { useId } from "react";
import { cn } from "cn";

interface KawungPatternProps {
  className?: string;
}

/** Faint repeating kawung texture. Decorative only; used once, behind the sidebar. */
export function KawungPattern({ className }: KawungPatternProps) {
  const id = useId();
  return (
    <svg className={cn("pointer-events-none absolute inset-0 size-full", className)} aria-hidden focusable="false">
      <defs>
        <pattern id={id} width="28" height="28" patternUnits="userSpaceOnUse">
          <g fill="currentColor">
            <ellipse cx="14" cy="7" rx="3.4" ry="5" />
            <ellipse cx="14" cy="21" rx="3.4" ry="5" />
            <ellipse cx="7" cy="14" rx="5" ry="3.4" />
            <ellipse cx="21" cy="14" rx="5" ry="3.4" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
