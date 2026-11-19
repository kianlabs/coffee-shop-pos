import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { hashVoidPin, saveSettings, verifyVoidPin, type PosSettings } from "@/data/settings";
import { saveStoreProfile } from "@/data/storeProfile";
import { type StoreProfile } from "@/domain/storeProfile";
import { errorMessage, notify } from "@/lib/notify";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";
import { checkSecurityChange, PIN_MAX_LENGTH } from "./securityRules";
import { useDraft } from "./useDraft";

export interface SettingsForm {
  /** Saved values: what the cashier screen and receipts use right now. */
  saved: PosSettings;
  settings: PosSettings;
  setSettings: Dispatch<SetStateAction<PosSettings>>;
  profile: StoreProfile;
  setProfile: Dispatch<SetStateAction<StoreProfile>>;
  newPin: string;
  setNewPin: (pin: string) => void;
  currentPin: string;
  setCurrentPin: (pin: string) => void;
  dirty: boolean;
  saving: boolean;
  save: () => Promise<void>;
}

/** A PIN migration in the background must not overwrite fields the user is editing. */
function keepEditsTakePin(draft: PosSettings, saved: PosSettings): PosSettings {
  return { ...draft, voidPinHash: saved.voidPinHash, voidPinSalt: saved.voidPinSalt };
}

function keepEdits<T>(draft: T): T {
  return draft;
}

function clampPin(pin: string): string {
  return pin.slice(0, PIN_MAX_LENGTH);
}

/**
 * Draft-vs-saved state for the settings screen. Typing changes only the
 * drafts; `save` validates the security rules, hashes a new PIN, persists
 * both settings and store profile, and then updates the app store.
 */
export function useSettingsForm(): SettingsForm {
  const saved = useAppStore((s) => s.posSettings);
  const savedProfile = useAppStore((s) => s.storeProfile);
  const setPosSettings = useAppStore((s) => s.setPosSettings);
  const setStoreProfile = useAppStore((s) => s.setStoreProfile);
  const settings = useDraft(saved, keepEditsTakePin);
  const profile = useDraft(savedProfile, keepEdits);
  const [newPin, setNewPinRaw] = useState("");
  const [currentPin, setCurrentPinRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const setSettingsDraft = settings.setDraft;
  const setProfileDraft = profile.setDraft;
  const settingsDraft = settings.draft;
  const profileDraft = profile.draft;

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const problem = await checkSecurityChange(
        { saved, draft: settingsDraft, newPin, currentPin },
        verifyVoidPin,
      );
      if (problem) {
        notify.error(problem);
        return;
      }
      let next = settingsDraft;
      const pin = newPin.trim();
      if (pin !== "") {
        const { hash, salt } = await hashVoidPin(pin);
        next = { ...settingsDraft, voidPinHash: hash, voidPinSalt: salt };
      }
      const storedSettings = saveSettings(next);
      setPosSettings(storedSettings);
      setSettingsDraft(storedSettings);
      const storedProfile = await saveStoreProfile(profileDraft);
      setStoreProfile(storedProfile);
      setProfileDraft(storedProfile);
      setNewPinRaw("");
      setCurrentPinRaw("");
      notify.success(t("pengaturan.save.success"));
    } catch (e) {
      notify.error(errorMessage(e, t("pengaturan.save.failed")));
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    saved,
    settingsDraft,
    profileDraft,
    newPin,
    currentPin,
    setPosSettings,
    setStoreProfile,
    setSettingsDraft,
    setProfileDraft,
  ]);

  return {
    saved,
    settings: settingsDraft,
    setSettings: setSettingsDraft,
    profile: profileDraft,
    setProfile: setProfileDraft,
    newPin,
    setNewPin: (pin) => setNewPinRaw(clampPin(pin)),
    currentPin,
    setCurrentPin: (pin) => setCurrentPinRaw(clampPin(pin)),
    dirty: settings.dirty || profile.dirty || newPin !== "",
    saving,
    save,
  };
}
