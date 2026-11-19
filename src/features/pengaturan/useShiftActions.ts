import { useCallback, useMemo, useState } from "react";
import { create } from "zustand";
import { repo } from "@/data/orderRepo";
import { formatRupiah } from "@/domain/money";
import { closeShift, openShift, summarizeShift, type Shift, type ShiftSummary } from "@/domain/shifts";
import { errorMessage, notify } from "@/lib/notify";
import { useAppStore } from "@/stores/appStore";

/** Keeps the last close-shift summary while the app runs, as the old App state did. */
const useLastSummary = create<{ text: string | null; set: (text: string | null) => void }>()((set) => ({
  text: null,
  set: (text) => set({ text }),
}));

const RECENT_LIMIT = 200;

export interface ShiftActions {
  shift: Shift | null;
  summary: ShiftSummary | null;
  /** The store only holds the 200 newest orders; older shift orders are not counted live. */
  truncated: boolean;
  lastSummary: string | null;
  closing: boolean;
  open: (cashierName: string, openCashRp: number) => void;
  close: () => Promise<void>;
}

export function useShiftActions(): ShiftActions {
  const shift = useAppStore((s) => s.shift);
  const orders = useAppStore((s) => s.orders);
  const setShift = useAppStore((s) => s.setShift);
  const lastSummary = useLastSummary((s) => s.text);
  const setLastSummary = useLastSummary((s) => s.set);
  const [closing, setClosing] = useState(false);

  const summary = useMemo(() => (shift ? summarizeShift(shift, orders) : null), [shift, orders]);
  const truncated = useMemo(() => {
    if (!shift || orders.length < RECENT_LIMIT) return false;
    const oldest = orders[orders.length - 1];
    return Boolean(oldest && oldest.createdAt > shift.openedAt);
  }, [shift, orders]);

  const open = useCallback(
    (cashierName: string, openCashRp: number) => {
      setLastSummary(null);
      setShift(openShift(cashierName, openCashRp));
      notify.success("Shift dibuka.");
    },
    [setShift, setLastSummary],
  );

  // Close with EVERY order, not the 200 in the store; otherwise the shift
  // total is smaller than the cash in the drawer.
  const close = useCallback(async () => {
    if (!shift || closing) return;
    setClosing(true);
    try {
      const all = await repo.loadAll();
      const { shift: closed, summary: final } = closeShift(shift, all);
      setShift(null);
      const openCash = shift.openCashRp > 0 ? ` (modal awal ${formatRupiah(shift.openCashRp)})` : "";
      setLastSummary(
        `Shift ${closed.cashierName || "(tanpa nama)"} ditutup: ${final.orderCount} order, omzet ${formatRupiah(final.grandTotalRp)}${openCash}.`,
      );
      notify.success(`Shift ditutup: ${final.orderCount} order, total ${formatRupiah(final.grandTotalRp)}.`);
    } catch (e) {
      notify.error(errorMessage(e, "Gagal menutup shift."));
    } finally {
      setClosing(false);
    }
  }, [shift, closing, setShift, setLastSummary]);

  return { shift, summary, truncated, lastSummary, closing, open, close };
}
