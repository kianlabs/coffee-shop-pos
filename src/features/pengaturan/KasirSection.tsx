import { Calculator } from "lucide-react";
import { type Dispatch, type SetStateAction } from "react";
import { MoneyInput } from "@/components/MoneyInput";
import { Input } from "@/components/ui/input";
import { type PosSettings } from "@/data/settings";
import { Field } from "./Field";
import { RoundingSelect } from "./RoundingSelect";
import { SettingsSection } from "./SettingsSection";
import { SwitchField } from "./SwitchField";

interface KasirSectionProps {
  settings: PosSettings;
  setSettings: Dispatch<SetStateAction<PosSettings>>;
}

type BooleanKey = "autoPrint" | "printLogo" | "blockNegativeStock" | "showCashNumpad";

const SWITCHES: { key: BooleanKey; label: string; description: string }[] = [
  { key: "autoPrint", label: "Cetak struk otomatis setelah bayar", description: "Struk langsung dicetak begitu transaksi tersimpan." },
  { key: "printLogo", label: "Cetak logo di struk", description: "Logo diatur di bagian Toko." },
  { key: "blockNegativeStock", label: "Tolak transaksi bila stok bahan tidak cukup", description: "Bila mati, transaksi tetap jalan dan stok bisa minus." },
  { key: "showCashNumpad", label: "Papan angka kasir", description: "Tampilkan tombol angka sentuh saat bayar tunai." },
];

export function KasirSection({ settings, setSettings }: KasirSectionProps) {
  const update = (patch: Partial<PosSettings>) => setSettings((prev) => ({ ...prev, ...patch }));
  return (
    <SettingsSection
      icon={Calculator}
      title="Kasir"
      description="Nama kasir, biaya tambahan, pembulatan, dan cetak."
      testId="settings-kasir"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cashier-name" label="Nama kasir" hint="Tampil di struk dan dipakai saat membuka shift.">
          <Input
            id="cashier-name"
            value={settings.cashierName}
            onChange={(e) => update({ cashierName: e.target.value })}
            placeholder="Opsional"
            maxLength={100}
            aria-describedby="cashier-name-hint"
          />
        </Field>
        <Field id="service-charge" label="Biaya layanan (Rp)" hint="Ditambahkan ke setiap transaksi. Isi 0 bila tidak ada.">
          <MoneyInput
            id="service-charge"
            value={settings.serviceChargeRp}
            allowEmpty
            onChange={(val) => update({ serviceChargeRp: Math.max(0, val) })}
            aria-describedby="service-charge-hint"
          />
        </Field>
        <Field id="rounding-step" label="Pembulatan total">
          <RoundingSelect
            id="rounding-step"
            value={settings.roundingStep}
            onChange={(roundingStep) => update({ roundingStep })}
          />
        </Field>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {SWITCHES.map(({ key, label, description }) => (
          <SwitchField
            key={key}
            id={`setting-${key}`}
            label={label}
            description={description}
            checked={settings[key]}
            onCheckedChange={(checked) => update({ [key]: checked })}
          />
        ))}
      </div>
    </SettingsSection>
  );
}
