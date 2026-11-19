import { Bluetooth, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type PrinterDevice } from "@/data/printer";

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
        title="Belum ada printer"
        description="Pasangkan printer lewat Setelan Bluetooth Android, lalu tekan Cari printer lagi."
        className="py-8"
      />
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-md border" aria-label="Printer Bluetooth yang dipasangkan">
      {devices.map((device) => {
        const connected = device.address === connectedAddress;
        return (
          <li key={device.address} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{device.name || "(tanpa nama)"}</p>
              <p className="truncate text-xs text-muted-foreground">{device.address}</p>
            </div>
            {connected ? (
              <Badge variant="outline" className="gap-1 text-success">
                <CheckCircle2 aria-hidden />
                Terhubung
              </Badge>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onConnect(device.address)}
              >
                Hubungkan
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
