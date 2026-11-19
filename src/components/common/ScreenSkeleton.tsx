import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface ScreenSkeletonProps {
  label: string;
  rows?: number;
}

/** Placeholder that appears only when loading takes longer than 300 ms. */
export function ScreenSkeleton({ label, rows = 5 }: ScreenSkeletonProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 300);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-3 p-4 md:p-6">
      <span className="sr-only">{label}</span>
      {visible && (
        <>
          <Skeleton className="h-11 w-full max-w-md" />
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </>
      )}
    </div>
  );
}
