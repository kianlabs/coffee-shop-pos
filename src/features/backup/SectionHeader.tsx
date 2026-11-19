import { type LucideIcon } from "lucide-react";
import { CardDescription, CardHeader } from "@/components/ui/card";

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  id: string;
}

export function SectionHeader({ icon: Icon, title, description, id }: SectionHeaderProps) {
  return (
    <CardHeader>
      <div className="flex items-center gap-2">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
        <h2 id={id} className="text-base leading-none font-semibold">
          {title}
        </h2>
      </div>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
  );
}
