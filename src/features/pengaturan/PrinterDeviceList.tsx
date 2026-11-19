import { Bluetooth, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type PrinterDevice } from "@/data/printer";
import { t } from "@/services/i18n";

interface PrinterDeviceListProps {
  devices: PrinterDevice[];
  connectedAddress: string | null;
  busy: boolean;
  onConnect: (address: string) => void;
}

export function PrinterDeviceList({ devices, connectedAddress, busy, onConnect }: PrinterDeviceListProps) {
  if (devices.length === 0) {
    return (
      <EmptyState
        icon={Bluetooth}
        title={t("pengaturan.printer.emptyTitle")}
        description={t("pengaturan.printer.emptyDescription")}
        className="py-8"
      />
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-md border" aria-label={t("pengaturan.printer.listLabel")}>
      {devices.map((device) => {
        const connected = device.address === connectedAddress;
        return (
          <li key={device.address} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{device.name || t("pengaturan.common.noName")}</p>
              <p className="truncate text-xs text-muted-foreground">{device.address}</p>
            </div>
            {connected ? (
              <Badge variant="outline" className="gap-1 text-success">
                <CheckCircle2 aria-hidden />
                {t("pengaturan.printer.connectedBadge")}
              </Badge>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onConnect(device.address)}
              >
                {t("pengaturan.printer.connect")}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
