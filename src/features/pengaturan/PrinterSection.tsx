import { CheckCircle2, CircleOff, Printer, Search, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrinterDeviceList } from "./PrinterDeviceList";
import { SettingsSection } from "./SettingsSection";
import { usePrinterActions } from "./usePrinterActions";

export function PrinterSection() {
  const { printer, devices, scanned, busy, scan, connect, disconnect } = usePrinterActions();
  const printerLabel = printer.name ?? printer.address ?? "";
  return (
    <SettingsSection
      icon={Printer}
      title="Printer Bluetooth"
      description="Printer thermal 58 mm. Pasangkan dulu lewat Setelan Bluetooth Android."
      testId="settings-printer"
    >
      <p
        className={
          printer.connected
            ? "flex items-center gap-2 rounded-md bg-success-soft p-3 text-sm"
            : "flex items-center gap-2 rounded-md bg-muted p-3 text-sm"
        }
        data-testid="printer-status"
      >
        {printer.connected ? (
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
        ) : (
          <CircleOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span>
          Status:{" "}
          <span className="font-semibold">
            {printer.connected ? `Terhubung ke ${printerLabel}` : "Belum terhubung"}
          </span>
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" loading={busy} onClick={() => void scan()}>
          {!busy && <Search aria-hidden />}
          Cari printer
        </Button>
        {printer.connected && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void disconnect()}>
            <Unplug aria-hidden />
            Putuskan
          </Button>
        )}
      </div>
      {scanned && (
        <PrinterDeviceList
          devices={devices}
          connectedAddress={printer.connected ? printer.address : null}
          busy={busy}
          onConnect={(address) => void connect(address)}
        />
      )}
    </SettingsSection>
  );
}
