import { useCallback, useEffect, useState } from "react";
import {
  connectPrinter,
  disconnectPrinter,
  listPrinterDevices,
  printerStatus,
  type PrinterDevice,
  type PrinterStatus,
} from "@/data/printer";
import { errorMessage, notify } from "@/lib/notify";
import { useAppStore } from "@/stores/appStore";

interface PrinterActions {
  printer: PrinterStatus;
  devices: PrinterDevice[];
  /** True after the first scan, so an empty list can say "nothing paired". */
  scanned: boolean;
  busy: boolean;
  scan: () => Promise<void>;
  connect: (address: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

export function usePrinterActions(): PrinterActions {
  const printer = useAppStore((s) => s.printer);
  const setPrinter = useAppStore((s) => s.setPrinter);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [scanned, setScanned] = useState(false);
  const [busy, setBusy] = useState(false);

  // Show the real connection state when the screen opens; failure keeps the store value.
  useEffect(() => {
    let cancelled = false;
    printerStatus()
      .then((status) => {
        if (!cancelled) setPrinter(status);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [setPrinter]);

  const scan = useCallback(async () => {
    setBusy(true);
    try {
      const list = await listPrinterDevices();
      setDevices(list);
      setScanned(true);
      setPrinter(await printerStatus());
      if (list.length > 0) notify.success(`${list.length} printer Bluetooth ditemukan.`);
      else notify.info("Belum ada printer yang dipasangkan. Pasangkan dulu lewat Setelan Bluetooth Android.");
    } catch (e) {
      notify.error(errorMessage(e, "Gagal memindai printer."));
    } finally {
      setBusy(false);
    }
  }, [setPrinter]);

  const connect = useCallback(
    async (address: string) => {
      setBusy(true);
      try {
        const status = await connectPrinter(address);
        setPrinter(status);
        if (status.connected) notify.success(`Terhubung ke ${status.name ?? address}.`);
        else notify.error("Koneksi printer gagal.");
      } catch (e) {
        notify.error(errorMessage(e, "Gagal menyambung printer."));
      } finally {
        setBusy(false);
      }
    },
    [setPrinter],
  );

  const disconnect = useCallback(async () => {
    setBusy(true);
    try {
      await disconnectPrinter();
      setPrinter({ connected: false, address: null, name: null });
      notify.success("Printer diputuskan.");
    } catch (e) {
      notify.error(errorMessage(e, "Gagal memutus printer."));
    } finally {
      setBusy(false);
    }
  }, [setPrinter]);

  return { printer, devices, scanned, busy, scan, connect, disconnect };
}
