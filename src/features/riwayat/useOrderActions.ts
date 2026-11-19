import { useState } from "react";
import { repo } from "@/data/orderRepo";
import { type Order } from "@/domain/orders";
import { printOrder } from "@/lib/printing";
import { errorMessage, notify } from "@/lib/notify";
import { useAppStore } from "@/stores/appStore";
import { type ActionRequest, type OrderAction } from "./historyUtils";
import { useVoidPin, type VoidPinState } from "./useVoidPin";

interface OrderActions {
  busyId: string | null;
  reloading: boolean;
  pin: VoidPinState;
  confirmRequest: ActionRequest | null;
  closeConfirm: () => void;
  start: (action: OrderAction, order: Order) => void;
  confirm: () => Promise<void>;
  print: (order: Order) => Promise<void>;
  reload: () => Promise<void>;
}

/** Print, void, refund, and reload for the history screen; one busy order at a time per row. */
export function useOrderActions(): OrderActions {
  const posSettings = useAppStore((s) => s.posSettings);
  const storeProfile = useAppStore((s) => s.storeProfile);
  const setOrders = useAppStore((s) => s.setOrders);
  const setDbReady = useAppStore((s) => s.setDbReady);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ActionRequest | null>(null);
  const [reloading, setReloading] = useState(false);
  const pin = useVoidPin(posSettings, setConfirmRequest);

  function start(action: OrderAction, order: Order) {
    const req: ActionRequest = { action, orderId: order.id, label: order.receiptNumber };
    if (posSettings.requireVoidPin) {
      pin.open(req);
      return;
    }
    setConfirmRequest(req);
  }

  async function confirm() {
    const req = confirmRequest;
    if (!req || busyId === req.orderId) return;
    setConfirmRequest(null);
    setBusyId(req.orderId);
    try {
      if (req.action === "refund") {
        setOrders(await repo.refund(req.orderId));
        notify.success(`Order ${req.label} berhasil di-refund.`);
      } else {
        setOrders(await repo.void(req.orderId));
        notify.success(`Order ${req.label} dibatalkan (void).`);
      }
    } catch (e) {
      notify.error(errorMessage(e, req.action === "refund" ? "Refund gagal." : "Void gagal."));
    } finally {
      setBusyId(null);
    }
  }

  // One print path only: no silent browser fallback, which could print two receipts.
  async function print(order: Order) {
    if (busyId === order.id) return;
    setBusyId(order.id);
    const label = order.receiptNumber;
    try {
      const printerName = await printOrder(order, storeProfile, posSettings);
      notify.success(`Struk ${label} terkirim ke ${printerName}.`);
    } catch (e) {
      const msg = errorMessage(e, "Cetak gagal.");
      notify.error(
        `Cetak gagal: ${msg} Order ${label} tetap tersimpan — cetak ulang tidak membuat order baru.`,
      );
    } finally {
      setBusyId(null);
    }
  }

  async function reload() {
    if (reloading) return;
    setReloading(true);
    try {
      setOrders(await repo.load(200));
      setDbReady(true);
      notify.success("Riwayat dimuat ulang.");
    } catch (e) {
      notify.error(errorMessage(e, "Gagal memuat order."));
    } finally {
      setReloading(false);
    }
  }

  return {
    busyId,
    reloading,
    pin,
    confirmRequest,
    closeConfirm: () => setConfirmRequest(null),
    start,
    confirm,
    print,
    reload,
  };
}
