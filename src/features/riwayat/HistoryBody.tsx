import { type ReactNode } from "react";
import { ReceiptText, SearchX } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { ScreenSkeleton } from "@/components/common/ScreenSkeleton";
import { t } from "@/services/i18n";

interface HistoryBodyProps {
  dbReady: boolean;
  hasOrders: boolean;
  isEmpty: boolean;
  list: ReactNode;
}

export function HistoryBody({ dbReady, hasOrders, isEmpty, list }: HistoryBodyProps) {
  if (!dbReady && !hasOrders) return <ScreenSkeleton label={t("riwayat.body.loading")} rows={4} />;
  if (!hasOrders) {
    return (
      <EmptyState
        icon={ReceiptText}
        title={t("riwayat.body.emptyTitle")}
        description={t("riwayat.body.emptyDescription")}
      />
    );
  }
  if (isEmpty) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("riwayat.body.noMatchTitle")}
        description={t("riwayat.body.noMatchDescription")}
      />
    );
  }
  return <>{list}</>;
}
