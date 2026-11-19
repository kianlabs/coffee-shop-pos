import { type ReactNode } from "react";
import { ReceiptText, SearchX } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { ScreenSkeleton } from "@/components/common/ScreenSkeleton";

interface HistoryBodyProps {
  dbReady: boolean;
  hasOrders: boolean;
  isEmpty: boolean;
  list: ReactNode;
}

export function HistoryBody({ dbReady, hasOrders, isEmpty, list }: HistoryBodyProps) {
  if (!dbReady && !hasOrders) return <ScreenSkeleton label="Memuat riwayat…" rows={4} />;
  if (!hasOrders) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="Belum ada order"
        description="Transaksi yang selesai akan muncul di sini."
      />
    );
  }
  if (isEmpty) {
    return (
      <EmptyState
        icon={SearchX}
        title="Tidak ada order yang cocok"
        description="Ubah kata kunci atau filter status untuk melihat order lain."
      />
    );
  }
  return <>{list}</>;
}
