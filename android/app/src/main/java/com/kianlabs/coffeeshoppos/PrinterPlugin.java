package com.kianlabs.coffeeshoppos;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * PrinterPlugin v1 — bridge ESC/POS untuk thermal printer (BT/USB).
 *
 * <p>Kontrak dengan TS (`src/data/printer.ts`):
 * - `print({data})`: terima base64 byte ESC/POS (INIT + teks + CUT), teruskan
 *   ke lapisan transport printer. Implementasi nyata (BT/USB SDK) disambung di
 *   {@link #sendToPrinter(byte[])} — stub saat ini me-log ukuran agar build
 *   hijau tanpa hardware.
 * - `printLogo({dataPngBase64})`: terima PNG base64 (tanpa prefix data:),
 *   decode ke {@link Bitmap}, konversi ke raster ESC/POS lalu kirim via
 *   transport yang sama. Stub: validasi decode + log dimensi.
 */
@CapacitorPlugin(name = "PrinterPlugin")
public class PrinterPlugin extends Plugin {

  @PluginMethod
  public void print(PluginCall call) {
    String data = call.getString("data");
    if (data == null || data.isEmpty()) {
      call.reject("data wajib base64 ESC/POS non-kosong.");
      return;
    }
    byte[] bytes;
    try {
      bytes = Base64.decode(data, Base64.DEFAULT);
    } catch (IllegalArgumentException e) {
      call.reject("data bukan base64 valid.");
      return;
    }
    try {
      sendToPrinter(bytes);
    } catch (Exception e) {
      call.reject("Gagal kirim ke printer: " + e.getMessage());
      return;
    }
    JSObject ret = new JSObject();
    ret.put("bytes", bytes.length);
    call.resolve(ret);
  }

  @PluginMethod
  public void printLogo(PluginCall call) {
    String png = call.getString("dataPngBase64");
    if (png == null || png.isEmpty()) {
      call.reject("dataPngBase64 wajib PNG base64 non-kosong.");
      return;
    }
    if (png.length() > 700_000) {
      call.reject("Logo PNG melebihi 512KB.");
      return;
    }
    byte[] raw;
    try {
      raw = Base64.decode(png, Base64.DEFAULT);
    } catch (IllegalArgumentException e) {
      call.reject("dataPngBase64 bukan base64 valid.");
      return;
    }
    Bitmap bmp = BitmapFactory.decodeByteArray(raw, 0, raw.length);
    if (bmp == null) {
      call.reject("PNG tidak bisa di-decode.");
      return;
    }
    // TODO(hardware): rasterisasi bmp → ESC/POS GS v 0 lalu sendToPrinter().
    // Stub: anggap sukses agar UI tidak blokir tanpa hardware.
    JSObject ret = new JSObject();
    ret.put("width", bmp.getWidth());
    ret.put("height", bmp.getHeight());
    call.resolve(ret);
  }

  /**
   * Titik sambung transport printer nyata (Bluetooth/USB SDK vendor).
   * Stub: no-op agar build + WebPrinter fallback tetap hijau.
   */
  private void sendToPrinter(byte[] bytes) {
    android.util.Log.i("PrinterPlugin", "stub print bytes=" + bytes.length);
  }
}
