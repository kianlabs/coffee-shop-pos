import { Clock } from "lucide-react";
import { t } from "@/services/i18n";
import { OpenShiftForm } from "./OpenShiftForm";
import { RunningShift } from "./RunningShift";
import { SettingsSection } from "./SettingsSection";
import { useShiftActions } from "./useShiftActions";

interface ShiftSectionProps {
  /** Saved cashier name; the shift uses the saved value, not the draft. */
  cashierName: string;
  cashierNameUnsaved: boolean;
}

export function ShiftSection({ cashierName, cashierNameUnsaved }: ShiftSectionProps) {
  const actions = useShiftActions();
  return (
    <SettingsSection
      icon={Clock}
      title={t("pengaturan.shift.title")}
      description={t("pengaturan.shift.description")}
      testId="settings-shift"
    >
      {actions.shift ? (
        <RunningShift
          shift={actions.shift}
          summary={actions.summary}
          truncated={actions.truncated}
          closing={actions.closing}
          onClose={actions.close}
        />
      ) : (
        <OpenShiftForm
          cashierName={cashierName}
          cashierNameUnsaved={cashierNameUnsaved}
          onOpen={actions.open}
        />
      )}
      {actions.lastSummary && (
        <p className="rounded-md bg-muted p-3 text-sm" data-testid="shift-last-summary">
          <span className="font-medium">{t("pengaturan.shift.lastSummaryLabel")}</span> {actions.lastSummary}
        </p>
      )}
    </SettingsSection>
  );
}
