import { Ban, BookOpen, PencilLine, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { modeLabel, type HppLine } from "./hppModel";

interface HppSourceBadgeProps {
  line: HppLine;
}

const ICONS = { manual: PencilLine, recipe: BookOpen, none: Ban, inherit: Undo2 } as const;

/** Where the HPP comes from. "Ikut produk" also names the inherited source. */
export function HppSourceBadge({ line }: HppSourceBadgeProps) {
  const Icon = ICONS[line.mode];
  const label =
    line.mode === "inherit"
      ? `Ikut produk (${modeLabel(line.effectiveMode)})`
      : modeLabel(line.mode);
  return (
    <Badge variant="outline" className="font-normal">
      <Icon aria-hidden />
      <span className="sr-only">Sumber HPP: </span>
      {label}
    </Badge>
  );
}
