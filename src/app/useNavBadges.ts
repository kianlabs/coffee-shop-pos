import { useAppStore } from "@/stores/appStore";
import { type View } from "./navigation";

/** Counts shown on navigation items: unsynced events on Backup. */
export function useNavBadges(): Partial<Record<View, number>> {
  const pending = useAppStore((s) => s.pendingCount);
  return { backup: pending ?? 0 };
}
