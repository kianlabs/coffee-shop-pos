import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DateField } from "./DateField";
import { isQuickPreset, PRESETS, type ReportRange } from "./useReportRange";

interface PeriodSelectorProps {
  range: ReportRange;
}

export function PeriodSelector({ range }: PeriodSelectorProps) {
  const selected = range.preset === "custom" ? "" : range.preset;
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label="Periode laporan"
        value={selected}
        onValueChange={(value) => {
          if (isQuickPreset(value)) range.setPreset(value);
        }}
        className="grid w-full grid-cols-4 bg-card lg:flex lg:w-fit"
      >
        {PRESETS.map((p) => (
          <ToggleGroupItem
            key={p.value}
            value={p.value}
            className="h-11 w-full px-1 lg:w-auto text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground sm:px-4 sm:text-sm"
          >
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto">
        <DateField
          id="laporan-mulai"
          label="Mulai"
          value={range.customStart}
          onChange={range.setCustomStart}
        />
        <DateField
          id="laporan-selesai"
          label="Selesai"
          value={range.customEnd}
          onChange={range.setCustomEnd}
        />
      </div>
    </div>
  );
}
