import { type Order } from "@/domain/orders";
import { type StoreProfile } from "@/domain/storeProfile";
import { activePrinter } from "@/data/printer";
import { renderReceiptText, type ReceiptOptions } from "@/data/receipt";
import { type PosSettings } from "@/data/settings";

export function receiptOptions(profile: StoreProfile, settings: PosSettings): ReceiptOptions {
  return {
    storeName: profile.name,
    storeAddress: profile.address,
    storeNpwp: profile.npwp,
    receiptHeader: profile.receiptHeader,
    receiptFooter: profile.receiptFooter,
    cashierName: settings.cashierName,
  };
}

export function receiptText(order: Order, profile: StoreProfile, settings: PosSettings): string {
  return renderReceiptText(order, receiptOptions(profile, settings));
}

/**
 * Prints through exactly one path. If the native printer fails we do not fall
 * back to the browser, which could produce two receipts for one sale.
 * Returns the printer name on success; throws on failure.
 */
export async function printOrder(
  order: Order,
  profile: StoreProfile,
  settings: PosSettings,
): Promise<string> {
  const port = activePrinter();
  const logoBase64 = settings.printLogo ? profile.logoB64 || "assets/logo.png" : undefined;
  await port.print(receiptText(order, profile, settings), { logoBase64 });
  return port.name();
}
