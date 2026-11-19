import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface SwitchFieldProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** The whole row is the touch target, so the small switch is easy to hit. */
export function SwitchField({ id, label, description, checked, onCheckedChange }: SwitchFieldProps) {
  return (
    <div className="flex min-h-touch items-center justify-between gap-4 rounded-md border px-3 py-2">
      <Label htmlFor={id} className="flex flex-1 cursor-pointer flex-col items-start gap-0.5 py-1">
        <span className="text-sm font-medium">{label}</span>
        {description && (
          <span className="text-xs font-normal text-muted-foreground">{description}</span>
        )}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
