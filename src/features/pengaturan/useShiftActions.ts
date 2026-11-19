import { useCallback, useMemo, useState } from "react";
import { create } from "zustand";
import { repo } from "@/data/orderRepo";
import { formatRupiah } from "@/domain/money";
import { closeShift, openShift, summarizeShift, type Shift, type ShiftSummary } from "@/domain/shifts";
import { errorMessage, notify } from "@/lib/notify";
import { t } from "@/services/i18n";
import { useAppStore } from "@/stores/appStore";

/** Keeps the last close-shift summary while the app runs, as the old App state did. */
const useLastSummary = create<{ text: string | null; set: (text: string | null) => void }>()((set) => ({
  text: null,
  set: (text) => set({ text }),
}));

const RECENT_LIMIT = 200;

interface ShiftActions {
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
      notify.success(t("pengaturan.shift.opened"));
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
      const modal = shift.openCashRp > 0 ? t("pengaturan.shift.openCashNote", { jumlah: formatRupiah(shift.openCashRp) }) : "";
      setLastSummary(
        t("pengaturan.shift.closedSummary", {
          nama: closed.cashierName || t("pengaturan.common.noName"),
          jumlah: final.orderCount,
          omzet: formatRupiah(final.grandTotalRp),
          modal,
        }),
      );
      notify.success(
        t("pengaturan.shift.closed", { jumlah: final.orderCount, total: formatRupiah(final.grandTotalRp) }),
      );
    } catch (e) {
      notify.error(errorMessage(e, t("pengaturan.shift.closeFailed")));
    } finally {
      setClosing(false);
    }
  }, [shift, closing, setShift, setLastSummary]);

  return { shift, summary, truncated, lastSummary, closing, open, close };
}
