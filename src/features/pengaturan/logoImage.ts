import { STORE_PROFILE_LIMITS } from "@/domain/storeProfile";

/** Thermal 58 mm printers print 384 dots per line. */
export const LOGO_MAX_WIDTH = 384;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("File logo tidak bisa dibaca."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gambar tidak bisa dibuka. Coba file PNG atau JPEG lain."));
    img.src = src;
  });
}

/**
 * Turns an image file into a PNG data URL at most 384 px wide (same as the
 * old handleLogoFileChange). Throws with a user-facing message.
 */
export async function resizeLogoFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("File harus berupa gambar (PNG/JPEG).");
  }
  const img = await loadImage(await readAsDataUrl(file));
  const scale = img.width > LOGO_MAX_WIDTH ? LOGO_MAX_WIDTH / img.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak bisa memproses gambar.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const b64 = canvas.toDataURL("image/png");
  // The store profile drops larger logos silently; say so instead.
  if (b64.length > STORE_PROFILE_LIMITS.logoB64) {
    throw new Error("Logo terlalu besar. Pakai gambar yang lebih sederhana atau lebih pendek.");
  }
  return b64;
}
