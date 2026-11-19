import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface UnitSelectProps {
  id: string;
  label: string;
  value: string;
  options: string[];
  baseUnit: string;
  disabled?: boolean;
  onChange: (unit: string) => void;
}

export function UnitSelect({ id, label, value, options, baseUnit, disabled, onChange }: UnitSelectProps) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full min-w-0">
          <SelectValue placeholder="Pilih satuan" />
        </SelectTrigger>
        <SelectContent>
          {options.map((u) => (
            <SelectItem key={u} value={u}>
              {u}
              {u === baseUnit && <span className="text-muted-foreground">(satuan dasar)</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
