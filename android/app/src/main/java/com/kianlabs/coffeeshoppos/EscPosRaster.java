package com.kianlabs.coffeeshoppos;

/**
 * Konversi piksel ARGB → perintah ESC/POS "GS v 0" (raster bit image).
 *
 * <p>Kelas ini sengaja tidak menyentuh {@code android.*} supaya bisa diuji di JVM
 * lewat unit test biasa (tanpa emulator/Robolectric).
 *
 * <p>Format perintah: {@code 0x1D 0x76 0x30 0x00 xL xH yL yH <data>}.
 * Lebar baris dibulatkan ke kelipatan 8 dot (xL/xH = jumlah byte per baris).
 */
final class EscPosRaster {

  /** Lebar cetak maksimum kertas thermal 58mm (576 dot untuk 80mm). */
  static final int MAX_WIDTH_58MM = 384;

  /** Ambang luminance: piksel < ambang dianggap hitam (dicetak). */
  static final int DEFAULT_THRESHOLD = 128;

  private EscPosRaster() {}

  /** Lebar setelah padding ke kelipatan 8 dot. */
  static int paddedWidth(int width) {
    if (width <= 0) return 0;
    return ((width + 7) / 8) * 8;
  }

  /**
   * Hitung tinggi hasil skala proporsional bila lebar melebihi {@code maxWidth}.
   * Dipakai pemanggil untuk membuat Bitmap hasil skala.
   */
  static int scaledHeight(int width, int height, int maxWidth) {
    if (width <= 0 || height <= 0) return 0;
    if (width <= maxWidth) return height;
    int h = Math.round(height * (maxWidth / (float) width));
    return Math.max(1, h);
  }

  /**
   * Rasterisasi piksel menjadi byte ESC/POS.
   *
   * @param width  lebar gambar (dot), harus &gt; 0
   * @param height tinggi gambar (dot), harus &gt; 0
   * @param argb   piksel ARGB baris-per-baris, panjang minimal {@code width * height}
   * @param threshold ambang luminance 0..255
   * @return byte siap kirim ke printer
   */
  static byte[] fromArgb(int width, int height, int[] argb, int threshold) {
    if (width <= 0 || height <= 0) {
      throw new IllegalArgumentException("Dimensi gambar harus > 0.");
    }
    if (argb == null || argb.length < width * height) {
      throw new IllegalArgumentException("Buffer piksel lebih kecil dari width*height.");
    }
    final int bytesPerRow = (width + 7) / 8;
    final int dataSize = bytesPerRow * height;
    final byte[] out = new byte[8 + dataSize];

    out[0] = 0x1D; // GS
    out[1] = 0x76; // v
    out[2] = 0x30; // 0
    out[3] = 0x00; // m = 0 (normal)
    out[4] = (byte) (bytesPerRow & 0xFF); // xL
    out[5] = (byte) ((bytesPerRow >> 8) & 0xFF); // xH
    out[6] = (byte) (height & 0xFF); // yL
    out[7] = (byte) ((height >> 8) & 0xFF); // yH

    int idx = 8;
    for (int y = 0; y < height; y++) {
      final int rowStart = y * width;
      for (int bx = 0; bx < bytesPerRow; bx++) {
        int b = 0;
        for (int bit = 0; bit < 8; bit++) {
          final int x = bx * 8 + bit;
          boolean black = false;
          if (x < width) {
            final int p = argb[rowStart + x];
            final int a = (p >>> 24) & 0xFF;
            final int r = (p >> 16) & 0xFF;
            final int g = (p >> 8) & 0xFF;
            final int bl = p & 0xFF;
            // Komposit ke kertas putih: PNG transparan tidak boleh jadi blok hitam.
            final int lum = (299 * r + 587 * g + 114 * bl) / 1000;
            final int effective = (lum * a + 255 * (255 - a)) / 255;
            black = effective < threshold;
          }
          if (black) {
            b |= (0x80 >>> bit); // bit kiri = dot paling kiri
          }
        }
        out[idx++] = (byte) b;
      }
    }
    return out;
  }
}
