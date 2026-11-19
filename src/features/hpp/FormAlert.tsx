import { CircleAlert } from "lucide-react";

interface FormAlertProps {
  message: string | null;
}

/** Inline validation message inside a dialog; the form keeps its values. */
export function FormAlert({ message }: FormAlertProps) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}
