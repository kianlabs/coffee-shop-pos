import { Lock, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { t } from "@/services/i18n";
import { Field } from "./Field";
import { hasStoredPin } from "./securityRules";
import { SettingsSection } from "./SettingsSection";
import { SwitchField } from "./SwitchField";
import { type SettingsForm } from "./useSettingsForm";

interface SecuritySectionProps {
  form: SettingsForm;
}

export function SecuritySection({ form }: SecuritySectionProps) {
  const { saved, settings, setSettings, newPin, setNewPin, currentPin, setCurrentPin } = form;
  const pinIsSet = hasStoredPin(saved);
  return (
    <SettingsSection
      icon={Lock}
      title={t("pengaturan.security.title")}
      description={t("pengaturan.security.description")}
      testId="settings-keamanan"
    >
      <SwitchField
        id="setting-requireVoidPin"
        label={t("pengaturan.security.requireVoidPin.label")}
        description={t("pengaturan.security.requireVoidPin.description")}
        checked={settings.requireVoidPin}
        onCheckedChange={(requireVoidPin) => setSettings((prev) => ({ ...prev, requireVoidPin }))}
      />
      <p className="flex items-center gap-2 text-sm">
        <ShieldCheck className={pinIsSet ? "size-4 text-success" : "size-4 text-muted-foreground"} aria-hidden />
        {pinIsSet ? t("pengaturan.security.pinSet") : t("pengaturan.security.pinNotSet")}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {saved.voidPinHash !== "" && (
          <Field id="current-pin" label={t("pengaturan.security.currentPin.label")} hint={t("pengaturan.security.currentPin.hint")}>
            <Input
              id="current-pin"
              type="password"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              placeholder={t("pengaturan.security.currentPin.placeholder")}
              autoComplete="current-password"
              aria-describedby="current-pin-hint"
            />
          </Field>
        )}
        <Field id="new-pin" label={t("pengaturan.security.newPin.label")} hint={t("pengaturan.security.newPin.hint")}>
          <Input
            id="new-pin"
            type="password"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            placeholder={
              settings.voidPinHash !== ""
                ? t("pengaturan.security.newPin.placeholderKeep")
                : t("pengaturan.security.newPin.placeholderNew")
            }
            autoComplete="new-password"
            aria-describedby="new-pin-hint"
          />
        </Field>
      </div>
    </SettingsSection>
  );
}
