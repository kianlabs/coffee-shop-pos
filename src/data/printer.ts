export type PrintOptions = {
  copies?: number;
  /** PNG base64 logo untuk dicetak di awal struk. */
  logoBase64?: string;
};

export interface PrinterPort {
  print(text: string, opts?: PrintOptions): Promise<void>;
  isAvailable(): boolean;
  name(): string;
}

export type PrinterDevice = { name: string; address: string; bonded: boolean };
export type PrinterStatus = { connected: boolean; address: string | null; name: string | null };

type CapacitorPrinterPlugin = {
  /** Terima base64 ESC/POS, teruskan ke printer thermal via kode native. */
  print: (args: { data: string }) => Promise<{ bytes?: number }>;
  /** Cetak raster logo (PNG base64 tanpa prefix data:). */
  printLogo?: (args: { dataPngBase64: string }) => Promise<{ width?: number; height?: number }>;
  /** Daftar printer Bluetooth yang sudah dipasangkan (bonded). */
  listDevices?: () => Promise<{ devices?: PrinterDevice[] }>;
  /** Buka koneksi RFCOMM ke printer. */
  connect?: (args: { address: string }) => Promise<{ connected?: boolean; name?: string; address?: string }>;
  disconnect?: () => Promise<unknown>;
  status?: () => Promise<PrinterStatus>;
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

export async function listPrinterDevices(): Promise<PrinterDevice[]> {
  const plugin = capacitorPrinter();
  if (!plugin?.listDevices) return [];
  const res = await plugin.listDevices();
  return Array.isArray(res?.devices) ? res.devices : [];
}

export async function connectPrinter(address: string): Promise<PrinterStatus> {
  const plugin = capacitorPrinter();
  if (!plugin?.connect) {
    throw new Error("Printer native belum mendukung koneksi Bluetooth.");
  }
  const res = await plugin.connect({ address });
  return {
    connected: res?.connected === true,
    address: res?.address ?? address,
    name: res?.name ?? null,
  };
}

export async function disconnectPrinter(): Promise<void> {
  const plugin = capacitorPrinter();
  if (plugin?.disconnect) {
    await plugin.disconnect();
  }
}

export async function printerStatus(): Promise<PrinterStatus> {
  const plugin = capacitorPrinter();
  if (!plugin?.status) {
    return { connected: false, address: null, name: null };
  }
  return plugin.status();
}

function printViaHiddenIframe(text: string, title: string, logoBase64?: string): void {
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
  const logoHtml = logoBase64
    ? `<div style="text-align:center;margin-bottom:8px;"><img src="${logoBase64.startsWith("data:") ? logoBase64 : `data:image/png;base64,${logoBase64}`}" style="max-width:160px;max-height:80px;height:auto;object-fit:contain;" alt="Logo" /></div>`
    : "";
  doc.open();
  doc.write(
    `<!doctype html><html><head><title>${title.replace(/</g, "&lt;")}</title></head>` +
      `<body style="margin:0;padding:8px 0;width:58mm;text-align:center;">` +
      logoHtml +
      `<pre style="font-family:monospace;font-size:12px;width:58mm;white-space:pre-wrap;text-align:left;margin:0;">${escaped}</pre>` +
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
 * Hanya dipakai kalau bridge native tidak ada.
 */
export class WebPrinter implements PrinterPort {
  name(): string {
    return "WebPrinter";
  }

  isAvailable(): boolean {
    return !isNativePrinterPresent();
  }

  async print(text: string, opts?: PrintOptions): Promise<void> {
    const copies = opts?.copies && opts.copies > 0 ? Math.trunc(opts.copies) : 1;
    for (let i = 0; i < copies; i += 1) {
      printViaHiddenIframe(text, `struk-${i + 1}`, opts?.logoBase64);
      // Beri jeda antar kopi agar job cetak tak saling menimpa.
      if (i + 1 < copies) {
        await delay(500);
      }
    }
  }
}

// ESC/POS: INIT + teks + feed + CUT.
// Inisialisasi printer (ESC @) dan set Code Page 0 CP437 (ESC t 0).
// Feed dinaikkan menjadi 6 baris agar teks terbawah keluar melewati tear bar printer 58mm manual.
const ESC_INIT = [0x1b, 0x40, 0x1b, 0x74, 0x00];
const ESC_FEED = [0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a];
const ESC_CUT = [0x1d, 0x56, 0x42, 0x00];

/**
 * Karakter Latin-1 yang punya posisi berbeda di CP437. Di luar tabel ini,
 * karakter > 0xFF diganti '?' agar byte tetap valid untuk printer.
 */
const CP437_MAP: Record<string, number> = {
  é: 0x82,
  â: 0x83,
  ä: 0x84,
  à: 0x85,
  å: 0x86,
  ç: 0x87,
  ê: 0x88,
  ë: 0x89,
  è: 0x8a,
  ï: 0x8b,
  î: 0x8c,
  ì: 0x8d,
  Ä: 0x8e,
  Å: 0x8f,
  ô: 0x93,
  ö: 0x94,
  ò: 0x95,
  û: 0x96,
  ù: 0x97,
  ÿ: 0x98,
  Ö: 0x99,
  Ü: 0x9a,
  ñ: 0xa4,
  Ñ: 0xa5,
  "±": 0xf1,
  "÷": 0xf6,
  "≈": 0xf7,
  "°": 0xf8,
  "·": 0xfa,
  "─": 0xc4,
  "│": 0xb3,
};

/**
 * Sanitasi teks untuk printer thermal:
 * - buang byte kontrol (ESC 0x1B, GS 0x1D, dll) supaya isi struk tidak bisa
 *   menyuntik perintah printer (mis. `ESC p` membuka laci kas).
 * - newline dipertahankan, tab diganti spasi.
 * - karakter di luar CP437 jadi '?'.
 */
export function toCp437ish(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of text) {
    if (ch === "\n") {
      bytes.push(0x0a);
      continue;
    }
    if (ch === "\t") {
      bytes.push(0x20);
      continue;
    }
    const code = ch.codePointAt(0) ?? 0x3f;
    if (code < 0x20 || code === 0x7f) {
      // Byte kontrol: jangan pernah diteruskan ke printer.
      bytes.push(0x20);
      continue;
    }
    const mapped = CP437_MAP[ch];
    if (mapped !== undefined) {
      bytes.push(mapped);
      continue;
    }
    bytes.push(code <= 0xff ? code : 0x3f);
  }
  return new Uint8Array(bytes);
}

/** Susunan byte struk — INIT, teks, feed, CUT. */
export function buildEscPosBytes(text: string): Uint8Array {
  const body = toCp437ish(text.endsWith("\n") ? text : `${text}\n`);
  const out = new Uint8Array(ESC_INIT.length + body.length + ESC_FEED.length + ESC_CUT.length);
  let offset = 0;
  out.set(ESC_INIT, offset);
  offset += ESC_INIT.length;
  out.set(body, offset);
  offset += body.length;
  out.set(ESC_FEED, offset);
  offset += ESC_FEED.length;
  out.set(ESC_CUT, offset);
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
    throw new Error("Printer native belum terpasang.");
  }
  await plugin.print({ data: base64Data });
}

/**
 * Printer ESC/POS via bridge native. TIDAK ada fallback diam-diam: kalau
 * printer belum tersambung, print() gagal dengan pesan yang bisa ditampilkan
 * ke kasir. Fallback ke WebPrinter hanya terjadi bila plugin native tidak ada
 * sama sekali (diputuskan di `activePrinter()`), supaya satu struk tidak
 * tercetak dua kali.
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
      if (opts?.logoBase64) {
        try {
          await printLogo(opts.logoBase64, this);
        } catch (logoErr) {
          console.warn("Gagal mencetak logo raster:", logoErr);
        }
      }
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
// `PrinterPlugin.printLogo`.
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

/** Cetak logo raster; fallback ke teks `[LOGO]` hanya bila PNG tidak ada. */
export async function printLogo(customBase64?: string, port?: PrinterPort): Promise<void> {
  const p = port ?? activePrinter();
  const native = capacitorPrinter();
  if (native && typeof native.printLogo === "function") {
    let png = customBase64;
    if (!png) {
      png = (await loadLogoPngBase64()) ?? undefined;
    }
    if (png) {
      const cleanB64 = png.replace(/^data:image\/[a-z]+;base64,/, "");
      await native.printLogo({ dataPngBase64: cleanB64 });
      return;
    }
  }
  await p.print(LOGO_PLACEHOLDER);
}
