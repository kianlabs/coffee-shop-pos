import { useEffect, useState } from "react";
import { ScreenSkeleton } from "@/components/common/ScreenSkeleton";
import { repo } from "@/data/orderRepo";
import { type Order } from "@/domain/orders";
import { errorMessage, notify } from "@/lib/notify";
import { useAppStore } from "@/stores/appStore";
import { SalesReport } from "./SalesReport";

/**
 * Reports use every order in the database, not the 200 most recent kept in
 * the store, so busy shops still get correct totals.
 */
export function LaporanScreen() {
  const recent = useAppStore((s) => s.orders);
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    repo
      .loadAll()
      .then((all) => {
        if (!cancelled) setOrders(all);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setOrders([]);
        notify.error(errorMessage(e, "Gagal memuat data laporan."));
      });
    return () => {
      cancelled = true;
    };
  }, [recent]);

  if (orders === null) return <ScreenSkeleton label="Memuat laporan…" rows={4} />;
  return <SalesReport orders={orders} />;
}
