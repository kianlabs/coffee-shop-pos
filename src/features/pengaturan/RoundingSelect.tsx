import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROUNDING_OPTIONS, type RoundingStep } from "@/data/settings";

interface RoundingSelectProps {
  id: string;
  value: RoundingStep;
  onChange: (step: RoundingStep) => void;
}

const LABELS: Record<RoundingStep, string> = {
  0: "Tanpa pembulatan (bawaan)",
  100: "Ke Rp100 terdekat",
  500: "Ke Rp500 terdekat",
  1000: "Ke Rp1.000 terdekat",
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
            {LABELS[step]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
