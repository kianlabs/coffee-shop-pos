import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { type StoreProfile } from "../domain/storeProfile";
import { getLegacyStoreProfile, loadStoreProfile, saveStoreProfile } from "../data/storeProfile";

export interface UseStoreProfileResult {
  /** Profil yang sudah tersimpan: dipakai struk dan header. */
  profile: StoreProfile;
  /** Salinan yang diedit di formulir; belum tersimpan. */
  draft: StoreProfile;
  setDraft: Dispatch<SetStateAction<StoreProfile>>;
  save: () => Promise<void>;
}

/**
 * State Store_Profile. Nilai awal diambil dari pengaturan lama (sinkron) agar
 * toko yang sudah berjalan tidak melihat nama bawaan sesaat; setelah database
 * siap, nilai dari SQLite menggantikannya.
 */
export function useStoreProfile(dbReady: boolean): UseStoreProfileResult {
  const [profile, setProfile] = useState<StoreProfile>(() => getLegacyStoreProfile());
  const [draft, setDraft] = useState<StoreProfile>(() => getLegacyStoreProfile());

  useEffect(() => {
    if (!dbReady) {
      return;
    }
    let cancelled = false;
    loadStoreProfile()
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        setProfile(loaded);
        setDraft(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dbReady]);

  const save = useCallback(async () => {
    const saved = await saveStoreProfile(draft);
    setProfile(saved);
    setDraft(saved);
  }, [draft]);

  return { profile, draft, setDraft, save };
}
