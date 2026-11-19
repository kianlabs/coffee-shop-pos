import { useState } from "react";
import { useAppStore } from "@/stores/appStore";
const DEFAULT_LOGO = "assets/logo.png";
/** The logo printed at the top of the receipt, shown only when "Cetak logo di struk" is on. */
export function ReceiptLogo() {
  const printLogo = useAppStore((s) => s.posSettings.printLogo);
  const logoB64 = useAppStore((s) => s.storeProfile.logoB64);
  const [failed, setFailed] = useState(false);
  if (!printLogo || failed) return null;
  return (
    <img
      src={logoB64 || DEFAULT_LOGO}
      alt="Logo Toko"
      className="mx-auto max-h-[70px] max-w-[140px] object-contain"
      onError={() => setFailed(true)}
    />
  );
}
