import { useCallback, useState } from "react";
import { decryptJson, isEncryptedBackup } from "@/data/cryptoBackup";
import { repo } from "@/data/orderRepo";
import { errorMessage, notify } from "@/lib/notify";
import { useAppStore } from "@/stores/appStore";

type RestoreStep =
  | { kind: "idle" }
  | { kind: "passphrase"; fileName: string; text: string }
  | { kind: "confirm"; fileName: string; json: string; currentCount: number };

const IDLE: RestoreStep = { kind: "idle" };

/**
 * Restore: read file -> (encrypted? ask passphrase + decrypt) -> confirm the
 * overwrite with the current order count -> importJson -> go to Riwayat.
 */
export function useRestoreFlow(onRestored: () => void) {
  const [step, setStep] = useState<RestoreStep>(IDLE);
  const [decrypting, setDecrypting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const askConfirm = useCallback(async (fileName: string, json: string) => {
    const current = await repo.load();
    setStep({ kind: "confirm", fileName, json, currentCount: current.length });
  }, []);

  const pickFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const text = await file.text();
        if (isEncryptedBackup(text)) {
          setStep({ kind: "passphrase", fileName: file.name, text });
          return;
        }
        await askConfirm(file.name, text);
      } catch (e) {
        notify.error(errorMessage(e, "Restore gagal."));
      }
    },
    [askConfirm],
  );

  const submitPassphrase = useCallback(
    async (passphrase: string) => {
      if (step.kind !== "passphrase" || decrypting) return;
      if (!passphrase) {
        notify.error("Restore dibatalkan: passphrase kosong.");
        return;
      }
      setDecrypting(true);
      try {
        const plain = await decryptJson(step.text, passphrase);
        await askConfirm(step.fileName.replace(/\.enc\.json$/, ".json"), plain);
      } catch (e) {
        // The dialog stays open so the passphrase can be corrected.
        notify.error(errorMessage(e, "Gagal mendekripsi backup."));
      } finally {
        setDecrypting(false);
      }
    },
    [askConfirm, decrypting, step],
  );

  const cancelPassphrase = useCallback(() => {
    if (decrypting) return;
    setStep(IDLE);
    notify.info("Restore dibatalkan.");
  }, [decrypting]);

  const cancelConfirm = useCallback(() => setStep(IDLE), []);

  const confirmRestore = useCallback(async () => {
    if (step.kind !== "confirm" || restoring) return;
    const { json } = step;
    setStep(IDLE);
    setRestoring(true);
    try {
      const count = await repo.importJson(json);
      const store = useAppStore.getState();
      store.bumpOrders();
      onRestored();
      notify.success(`Restore berhasil — ${count} order dimuat.`);
      store.setView("riwayat");
    } catch (e) {
      notify.error(errorMessage(e, "Restore gagal."));
    } finally {
      setRestoring(false);
    }
  }, [onRestored, restoring, step]);

  return {
    step,
    decrypting,
    restoring,
    pickFile,
    submitPassphrase,
    cancelPassphrase,
    cancelConfirm,
    confirmRestore,
  };
}
