import { Store } from "lucide-react";
import { type Dispatch, type SetStateAction } from "react";
import { Separator } from "@/components/ui/separator";
import { type StoreProfile } from "@/domain/storeProfile";
import { LogoField } from "./LogoField";
import { SettingsSection } from "./SettingsSection";
import { StoreProfileFields } from "./StoreProfileFields";

interface StoreSectionProps {
  profile: StoreProfile;
  setProfile: Dispatch<SetStateAction<StoreProfile>>;
}

export function StoreSection({ profile, setProfile }: StoreSectionProps) {
  return (
    <SettingsSection
      icon={Store}
      title="Toko"
      description="Identitas toko yang tampil di struk."
      testId="settings-toko"
    >
      <StoreProfileFields draft={profile} onChange={setProfile} />
      <Separator />
      <LogoField
        logoB64={profile.logoB64}
        onChange={(logoB64) => setProfile((prev) => ({ ...prev, logoB64 }))}
      />
    </SettingsSection>
  );
}
