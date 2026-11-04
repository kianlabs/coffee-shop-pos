export type PrintOptions = {
  copies?: number;
};

export interface PrinterPort {
  print(text: string, opts?: PrintOptions): Promise<void>;
  isAvailable(): boolean;
  name(): string;
}

type CapacitorPrinterPlugin = {
  /** Terima base64 ESC/POS, teruskan ke printer thermal via kode native. */
  print: (args: { data: string }) => Promise<unknown>;
  /** Opsional: cetak raster logo (PNG base64 tanpa prefix). Ada di plugin v1. */
  printLogo?: (args: { dataPngBase64: string }) => Promise<unknown>;
};

function capacitorPrinter(): CapacitorPrinterPlugin | null {
  // SAFETY: window.Capacitor hanya ada di build native; shape dicek via
  // optional chaining + typeof di bawah, null bila tak ada (fallback WebPrinter).
  const w = window as unknown as {
    Capacitor?: { Plugins?: { PrinterPlugin?: CapacitorPrinterPlugin } };
  };
  const plugin = w.Capacitor?.Plugins?.PrinterPlugin;
  return plugin && typeof plugin.print === "function" ? plugin : null;
}

/** True bila bridge native printer (Capacitor PrinterPlugin) terpasang. */
export function isNativePrinterPresent(): boolean {
  return capacitorPrinter() !== null;
}

function printViaHiddenIframe(text: string, title: string): void {
  // Iframe tersembunyi same-origin (bukan window.open) — tanpa risiko open-redirect.
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("title", title);
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error("Cetak gagal — browser memblokir iframe cetak.");
  }
  doc.open();
  doc.write(
    `<!doctype html><html><head><title>${title.replace(/</g, "&lt;")}</title></head>` +
      `<body><pre style="font-family:monospace;font-size:12px;width:58mm;white-space:pre-wrap;">${escaped}</pre>` +
      `</body></html>`,
  );
  doc.close();
  const win = iframe.contentWindow;
  if (win) win.focus();
  if (win) win.print();
  window.setTimeout(() => iframe.remove(), 1000);
}
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
/**
 * Printer browser: cetak via iframe tersembunyi same-origin + window.print().
 * Selalu tersedia di browser desktop; tanpa hardware pun jalan.
 */
export class WebPrinter implements PrinterPort {
  name(): string {
    return "WebPrinter";
  }

  isAvailable(): boolean {
    // DEFAULT: WebPrinter = fallback saat native tak ada (!isNative).
    // Tetap true agar tombol Cetak selalu bisa ditekan.
    return !isNativePrinterPresent();
  }

  async print(text: string, opts?: PrintOptions): Promise<void> {
    const copies = opts?.copies && opts.copies > 0 ? Math.trunc(opts.copies) : 1;
    for (let i = 0; i < copies; i += 1) {
      printViaHiddenIframe(text, `struk-${i + 1}`);
      // Beri jeda antar kopi agar job cetak tak saling menimpa.
      if (i + 1 < copies) {
        await delay(500);
      }
    }
  }
}

// ESC/POS: INIT + teks + feed + CUT.
const ESC_INIT = [0x1b, 0x40];
const ESC_CUT = [0x1d, 0x56, 0x42, 0x00];

/**
 * DEFAULT: pemetaan CP437 seadanya — cukup untuk struk Indonesia.
 * `Rp` sudah ASCII (tanpa perubahan); `─`→`-`, `é`→`e`.
 * Karakter di luar 0-255 diganti `?` agar byte tetap valid.
 */
export function toCp437ish(text: string): Uint8Array {
  const normalized = text.replace(/─/g, "-").replace(/é/g, "e").replace(/è/g, "e");
  const bytes = new Uint8Array(normalized.length);
  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    bytes[i] = code <= 0xff ? code : 0x3f; // 0x3F = '?'
  }
  return bytes;
}

/** DEFAULT: susunan byte struk — INIT, teks + newline, CUT. */
export function buildEscPosBytes(text: string): Uint8Array {
  const body = toCp437ish(text.endsWith("\n") ? text : `${text}\n`);
  const out = new Uint8Array(ESC_INIT.length + body.length + ESC_CUT.length);
  out.set(ESC_INIT, 0);
  out.set(body, ESC_INIT.length);
  out.set(ESC_CUT, ESC_INIT.length + body.length);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function sendToNative(base64Data: string): Promise<void> {
  const plugin = capacitorPrinter();
  if (!plugin) {
    throw new Error("Printer native belum terpasang — pakai WebPrinter.");
  }
  await plugin.print({ data: base64Data });
}

/**
 * Printer ESC/POS via bridge native (Capacitor `PrinterPlugin`).
 * JANGAN buat plugin native asli di sini — file ini hanya bridge-ready:
 * tanpa plugin terpasang, print() throw dengan pesan jelas.
 */
export class EscPosPrinter implements PrinterPort {
  name(): string {
    return "EscPosPrinter";
  }

  isAvailable(): boolean {
    return isNativePrinterPresent();
  }

  async print(text: string, opts?: PrintOptions): Promise<void> {
    const copies = opts?.copies && opts.copies > 0 ? Math.trunc(opts.copies) : 1;
    const base64 = bytesToBase64(buildEscPosBytes(text));
    for (let i = 0; i < copies; i += 1) {
      await sendToNative(base64);
    }
  }
}

/** Native terpasang? EscPos : Web. Tanpa hardware pun WebPrinter jalan. */
export function activePrinter(): PrinterPort {
  return isNativePrinterPresent() ? new EscPosPrinter() : new WebPrinter();
}

// Logo raster: `public/assets/logo.png` (disajikan sebagai `assets/logo.png`,
// PNG monokrom ≤384px untuk 58mm) dibaca via fetch → base64 lalu dikirim ke
// `PrinterPlugin.printLogo` bila tersedia. Tanpa file/plugin: fallback "[LOGO]".
export const LOGO_PLACEHOLDER = "[LOGO]";
export const LOGO_ASSET_PATH = "assets/logo.png";

export async function loadLogoPngBase64(assetPath: string = LOGO_ASSET_PATH): Promise<string | null> {
  try {
    const res = await fetch(assetPath);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 512 * 1024) return null;
    return bytesToBase64(buf);
  } catch {
    return null;
  }
}

export async function printLogoPlaceholder(port?: PrinterPort): Promise<void> {
  const p = port ?? activePrinter();
  const native = capacitorPrinter();
  if (native && typeof native.printLogo === "function") {
    const png = await loadLogoPngBase64();
    if (png) {
      await native.printLogo({ dataPngBase64: png });
      return;
    }
  }
  return p.print(LOGO_PLACEHOLDER);
}

/**
 * PLUGIN NATIVE (Android): `PrinterPlugin` v1.
 * - Lokasi: `android/app/src/main/java/com/kianlabs/coffeeshoppos/PrinterPlugin.java`
 * - Terdaftar di `MainActivity` via `registerPlugin(PrinterPlugin.class)`.
 * - Metode: `print({data})` (ESC/POS base64, BT/USB) + `printLogo({dataPngBase64})`.
 * - Belum ada hardware? `activePrinter()` otomatis fallback WebPrinter.
 */
