import { Lock, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
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
      title="Keamanan"
      description="Lindungi pembatalan (void) transaksi dari orang yang tidak berwenang."
      testId="settings-keamanan"
    >
      <SwitchField
        id="setting-requireVoidPin"
        label="Minta PIN saat void"
        description="Kasir harus memasukkan PIN sebelum membatalkan transaksi."
        checked={settings.requireVoidPin}
        onCheckedChange={(requireVoidPin) => setSettings((prev) => ({ ...prev, requireVoidPin }))}
      />
      <p className="flex items-center gap-2 text-sm">
        <ShieldCheck className={pinIsSet ? "size-4 text-success" : "size-4 text-muted-foreground"} aria-hidden />
        {pinIsSet ? "PIN void sudah diatur." : "PIN void belum diatur."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {saved.voidPinHash !== "" && (
          <Field id="current-pin" label="PIN saat ini" hint="Wajib diisi untuk mengganti PIN atau mematikan PIN void.">
            <Input
              id="current-pin"
              type="password"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              placeholder="Masukkan PIN saat ini"
              autoComplete="current-password"
              aria-describedby="current-pin-hint"
            />
          </Field>
        )}
        <Field
          id="new-pin"
          label="PIN void baru"
          hint="Minimal 4 karakter. PIN disimpan sebagai hash PBKDF2 dengan salt, bukan teks biasa."
        >
          <Input
            id="new-pin"
            type="password"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            placeholder={settings.voidPinHash !== "" ? "Kosongkan bila tidak ganti PIN" : "Isi bila PIN void aktif"}
            autoComplete="new-password"
            aria-describedby="new-pin-hint"
          />
        </Field>
      </div>
    </SettingsSection>
  );
}
