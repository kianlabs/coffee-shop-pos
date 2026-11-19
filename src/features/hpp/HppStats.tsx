import { CircleAlert, CircleCheck, Package, TrendingDown } from "lucide-react";
import { type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { t } from "@/services/i18n";

interface HppStatsProps {
  total: number;
  kosong: number;
  rugi: number;
}

interface StatProps {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: string;
}

function Stat({ icon: Icon, label, value, tone }: StatProps) {
  return (
    <li className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", tone)}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{label}</span>
      <strong className="tabular-nums">{value}</strong>
    </li>
  );
}

export function HppStats({ total, kosong, rugi }: HppStatsProps) {
  return (
    <ul className="grid gap-2 sm:grid-cols-3" aria-label={t("hpp.stats.ariaLabel")} data-testid="hpp-stats">
      <Stat icon={Package} label={t("hpp.stats.products")} value={total} tone="bg-card" />
      <Stat
        icon={kosong > 0 ? CircleAlert : CircleCheck}
        label={t("hpp.stats.empty")}
        value={kosong}
        tone={kosong > 0 ? "bg-warning-soft text-warning" : "bg-card"}
      />
      <Stat
        icon={rugi > 0 ? TrendingDown : CircleCheck}
        label={t("hpp.stats.loss")}
        value={rugi}
        tone={rugi > 0 ? "bg-destructive/10 text-destructive" : "bg-card"}
      />
    </ul>
  );
}
