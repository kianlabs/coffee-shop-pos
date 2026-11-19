import { type ReactNode } from "react";
import { cn } from "cn";

interface ReportSectionProps {
  id: string;
  title: string;
  description: string;
  /** Right-aligned header content, e.g. totals. */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ReportSection({ id, title, description, meta, children, className }: ReportSectionProps) {
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5", className)}>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={id} className="text-base font-semibold">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {meta}
      </header>
      {children}
    </section>
  );
}
