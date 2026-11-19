import { useState } from "react";
import {
  MAX_PIN_ATTEMPTS,
  PIN_LOCKOUT_MS,
  clearPinLockout,
  getPinLockoutState,
  recordPinFailure,
  verifyVoidPin,
  type PosSettings,
} from "@/data/settings";
import { notify } from "@/lib/notify";
import { type ActionRequest } from "./historyUtils";

const PIN_MAX_LENGTH = 32;

/** Seconds left on an active lockout, or null when PIN entry is allowed. */
function lockoutSecondsLeft(): number | null {
  const { lockedUntil } = getPinLockoutState();
  if (!lockedUntil || Date.now() >= lockedUntil) return null;
  return Math.ceil((lockedUntil - Date.now()) / 1000);
}

export interface VoidPinState {
  request: ActionRequest | null;
  input: string;
  error: string | null;
  attempts: number;
  verifying: boolean;
  open: (req: ActionRequest) => void;
  setInput: (value: string) => void;
  cancel: () => void;
  submit: () => Promise<void>;
}

/**
 * PIN gate for void/refund. `onVerified` runs after a correct PIN; three wrong
 * PINs lock the gate for PIN_LOCKOUT_MS (persisted by data/settings).
 */
export function useVoidPin(
  settings: PosSettings,
  onVerified: (req: ActionRequest) => void,
): VoidPinState {
  const [request, setRequest] = useState<ActionRequest | null>(null);
  const [input, setRawInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [verifying, setVerifying] = useState(false);

  function reset() {
    setRequest(null);
    setRawInput("");
    setError(null);
  }

  function open(req: ActionRequest) {
    const seconds = lockoutSecondsLeft();
    if (seconds !== null) {
      notify.error(
        `Akses PIN terkunci karena ${MAX_PIN_ATTEMPTS}x salah. Tunggu ${seconds} detik lagi.`,
      );
      return;
    }
    if (settings.voidPinHash === "" || settings.voidPinSalt === "") {
      notify.error("PIN void aktif tapi belum diisi di Pengaturan.");
      return;
    }
    setRawInput("");
    setError(null);
    setAttempts(getPinLockoutState().attempts);
    setRequest(req);
  }

  function setInput(value: string) {
    setRawInput(value.slice(0, PIN_MAX_LENGTH));
    setError(null);
  }

  function cancel() {
    if (verifying) return;
    reset();
  }

  function handleFailure(req: ActionRequest) {
    const updated = recordPinFailure();
    setRawInput("");
    setAttempts(updated.attempts);
    if (updated.lockedUntil) {
      const minutes = Math.round(PIN_LOCKOUT_MS / 60_000);
      reset();
      notify.error(
        `PIN salah ${MAX_PIN_ATTEMPTS}x — akses ${req.action} dikunci selama ${minutes} menit.`,
      );
      return;
    }
    setError(`PIN salah (percobaan ${updated.attempts} dari ${MAX_PIN_ATTEMPTS}).`);
  }

  async function submit() {
    if (!request || verifying) return;
    const seconds = lockoutSecondsLeft();
    if (seconds !== null) {
      setError(
        `Akses terkunci karena ${MAX_PIN_ATTEMPTS}x salah. Coba lagi dalam ${seconds} detik.`,
      );
      return;
    }
    const req = request;
    setVerifying(true);
    try {
      const ok = await verifyVoidPin(input, settings);
      if (!ok) {
        handleFailure(req);
        return;
      }
      clearPinLockout();
      setAttempts(0);
      reset();
      onVerified(req);
    } catch {
      setError("PIN tidak bisa diverifikasi. Coba lagi.");
    } finally {
      setVerifying(false);
    }
  }

  return { request, input, error, attempts, verifying, open, setInput, cancel, submit };
}
