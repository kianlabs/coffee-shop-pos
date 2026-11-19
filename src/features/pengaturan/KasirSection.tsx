import { Calculator } from "lucide-react";
import { type Dispatch, type SetStateAction } from "react";
import { MoneyInput } from "@/components/MoneyInput";
import { Input } from "@/components/ui/input";
import { type PosSettings } from "@/data/settings";
import { t } from "@/services/i18n";
import { Field } from "./Field";
import { RoundingSelect } from "./RoundingSelect";
import { SettingsSection } from "./SettingsSection";
import { SwitchField } from "./SwitchField";

interface KasirSectionProps {
  settings: PosSettings;
  setSettings: Dispatch<SetStateAction<PosSettings>>;
}

type BooleanKey = "autoPrint" | "printLogo" | "blockNegativeStock" | "showCashNumpad";

const SWITCHES: { key: BooleanKey; labelKey: string; descriptionKey: string }[] = [
  { key: "autoPrint", labelKey: "pengaturan.kasir.autoPrint.label", descriptionKey: "pengaturan.kasir.autoPrint.description" },
  { key: "printLogo", labelKey: "pengaturan.kasir.printLogo.label", descriptionKey: "pengaturan.kasir.printLogo.description" },
  { key: "blockNegativeStock", labelKey: "pengaturan.kasir.blockNegativeStock.label", descriptionKey: "pengaturan.kasir.blockNegativeStock.description" },
  { key: "showCashNumpad", labelKey: "pengaturan.kasir.showCashNumpad.label", descriptionKey: "pengaturan.kasir.showCashNumpad.description" },
];

export function KasirSection({ settings, setSettings }: KasirSectionProps) {
  const update = (patch: Partial<PosSettings>) => setSettings((prev) => ({ ...prev, ...patch }));
  return (
    <SettingsSection
      icon={Calculator}
      title={t("pengaturan.kasir.title")}
      description={t("pengaturan.kasir.description")}
      testId="settings-kasir"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cashier-name" label={t("pengaturan.kasir.cashierName.label")} hint={t("pengaturan.kasir.cashierName.hint")}>
          <Input
            id="cashier-name"
            value={settings.cashierName}
            onChange={(e) => update({ cashierName: e.target.value })}
            placeholder={t("pengaturan.common.optional")}
            maxLength={100}
            aria-describedby="cashier-name-hint"
          />
        </Field>
        <Field id="service-charge" label={t("pengaturan.kasir.serviceCharge.label")} hint={t("pengaturan.kasir.serviceCharge.hint")}>
          <MoneyInput
            id="service-charge"
            value={settings.serviceChargeRp}
            allowEmpty
            onChange={(val) => update({ serviceChargeRp: Math.max(0, val) })}
            aria-describedby="service-charge-hint"
          />
        </Field>
        <Field id="rounding-step" label={t("pengaturan.kasir.rounding.label")}>
          <RoundingSelect
            id="rounding-step"
            value={settings.roundingStep}
            onChange={(roundingStep) => update({ roundingStep })}
          />
        </Field>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {SWITCHES.map(({ key, labelKey, descriptionKey }) => (
          <SwitchField
            key={key}
            id={`setting-${key}`}
            label={t(labelKey)}
            description={t(descriptionKey)}
            checked={settings[key]}
            onCheckedChange={(checked) => update({ [key]: checked })}
          />
        ))}
      </div>
    </SettingsSection>
  );
}
