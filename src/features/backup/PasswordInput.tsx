import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/services/i18n";

interface PasswordInputProps extends Omit<ComponentProps<typeof Input>, "type"> {
  id: string;
}

/** Password field with a show/hide toggle. Never autocompleted. */
export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex gap-2">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={visible ? t("backup.password.hide") : t("backup.password.show")}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      </Button>
    </div>
  );
}
