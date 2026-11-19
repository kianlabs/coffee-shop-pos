import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROUNDING_OPTIONS, type RoundingStep } from "@/data/settings";
import { t } from "@/services/i18n";

interface RoundingSelectProps {
  id: string;
  value: RoundingStep;
  onChange: (step: RoundingStep) => void;
}

const LABEL_KEYS: Record<RoundingStep, string> = {
  0: "pengaturan.rounding.none",
  100: "pengaturan.rounding.nearest100",
  500: "pengaturan.rounding.nearest500",
  1000: "pengaturan.rounding.nearest1000",
};

function toStep(raw: string): RoundingStep | null {
  return ROUNDING_OPTIONS.find((step) => String(step) === raw) ?? null;
}

export function RoundingSelect({ id, value, onChange }: RoundingSelectProps) {
  return (
    <Select
      value={String(value)}
      onValueChange={(raw) => {
        const step = toStep(raw);
        if (step !== null) onChange(step);
      }}
    >
      <SelectTrigger id={id} className="h-11 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROUNDING_OPTIONS.map((step) => (
          <SelectItem key={step} value={String(step)} className="min-h-touch">
            {t(LABEL_KEYS[step])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
