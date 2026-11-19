import { cn } from "cn";

interface BrandMarkProps {
  className?: string;
  /** Color of the four petals; the center uses the current text color. */
  petalClassName?: string;
}

/**
 * Suro POS mark: a single kawung motif, the four-petal batik pattern long
 * associated with the Surakarta and Yogyakarta courts.
 */
export function BrandMark({ className, petalClassName = "text-sidebar-mark" }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden focusable="false">
      <g className={petalClassName} fill="currentColor">
        <ellipse cx="16" cy="8.5" rx="4.6" ry="6.5" />
        <ellipse cx="16" cy="23.5" rx="4.6" ry="6.5" />
        <ellipse cx="8.5" cy="16" rx="6.5" ry="4.6" />
        <ellipse cx="23.5" cy="16" rx="6.5" ry="4.6" />
      </g>
      <circle cx="16" cy="16" r="2.4" fill="currentColor" />
    </svg>
  );
}
