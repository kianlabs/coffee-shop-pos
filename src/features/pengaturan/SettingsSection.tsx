import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface SettingsSectionProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
  testId?: string;
}

export function SettingsSection({ icon: Icon, title, description, children, testId }: SettingsSectionProps) {
  return (
    <Card className="gap-5 py-5 shadow-none" data-testid={testId}>
      <div className="flex items-start gap-3 px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <CardContent className="flex flex-col gap-4 px-5">{children}</CardContent>
    </Card>
  );
}
