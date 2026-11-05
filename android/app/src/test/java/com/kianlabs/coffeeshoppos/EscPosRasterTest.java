package com.kianlabs.coffeeshoppos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.util.Arrays;
import org.junit.Test;

/**
 * Unit test raster ESC/POS (berjalan di JVM, tanpa emulator).
 * Fokus: header GS v 0, padding lebar ke kelipatan 8, polaritas bit, alpha.
 */
public class EscPosRasterTest {

  private static final int WHITE = 0xFFFFFFFF;
  private static final int BLACK = 0xFF000000;

  @Test
  public void header_isGsV0WithCorrectDimensions() {
    int[] px = new int[8 * 2];
    Arrays.fill(px, WHITE);

    byte[] out = EscPosRaster.fromArgb(8, 2, px, 128);

    assertEquals(0x1D, out[0] & 0xFF); // GS
    assertEquals(0x76, out[1] & 0xFF); // v
    assertEquals(0x30, out[2] & 0xFF); // 0
    assertEquals(0x00, out[3] & 0xFF); // m
    assertEquals(1, out[4] & 0xFF); // xL = 1 byte/baris
    assertEquals(0, out[5] & 0xFF); // xH
    assertEquals(2, out[6] & 0xFF); // yL
    assertEquals(0, out[7] & 0xFF); // yH
    assertEquals(8 + 1 * 2, out.length);
  }

  @Test
  public void widthIsPaddedToMultipleOfEight() {
    assertEquals(8, EscPosRaster.paddedWidth(5));
    assertEquals(8, EscPosRaster.paddedWidth(8));
    assertEquals(16, EscPosRaster.paddedWidth(9));
    assertEquals(384, EscPosRaster.paddedWidth(384));

    // 5 piksel → tetap 1 byte per baris (3 bit sisa padding putih).
    byte[] out = EscPosRaster.fromArgb(5, 1, new int[] { WHITE, WHITE, WHITE, WHITE, WHITE }, 128);
    assertEquals(8 + 1, out.length);
    assertEquals(1, out[4] & 0xFF);
  }

  @Test
  public void blackPixelSetsMostSignificantBit() {
    int[] px = { BLACK, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE };
    byte[] out = EscPosRaster.fromArgb(8, 1, px, 128);
    assertEquals(0x80, out[8] & 0xFF);
  }

  @Test
  public void pixelOnSecondByteUsesItsOwnMsb() {
    int[] px = new int[9];
    Arrays.fill(px, WHITE);
    px[8] = BLACK; // piksel ke-9 → byte kedua, bit 7

    byte[] out = EscPosRaster.fromArgb(9, 1, px, 128);

    assertEquals(2, out[4] & 0xFF); // 2 byte per baris
    assertEquals(0x00, out[8] & 0xFF); // byte pertama putih
    assertEquals(0x80, out[9] & 0xFF); // byte kedua, dot pertama hitam
  }

  @Test
  public void transparentPixelIsTreatedAsWhite() {
    // ARGB 0x00000000 = hitam transparan; harus dikomposit ke kertas putih.
    int[] px = { 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000 };
    byte[] out = EscPosRaster.fromArgb(8, 1, px, 128);
    assertEquals(0x00, out[8] & 0xFF);
  }

  @Test
  public void thresholdBoundaryIsInclusiveOfDarkSide() {
    int[] dark = new int[8];
    Arrays.fill(dark, WHITE);
    dark[0] = 0xFF7F7F7F; // luminance 127 → hitam
    assertEquals(0x80, EscPosRaster.fromArgb(8, 1, dark, 128)[8] & 0xFF);

    int[] light = new int[8];
    Arrays.fill(light, WHITE);
    light[0] = 0xFF808080; // luminance 128 → putih (ambang tidak inklusif)
    assertEquals(0x00, EscPosRaster.fromArgb(8, 1, light, 128)[8] & 0xFF);
  }

  @Test
  public void scaledHeightKeepsAspectRatioAndCapsWidth() {
    assertEquals(100, EscPosRaster.scaledHeight(768, 200, 384));
    assertEquals(200, EscPosRaster.scaledHeight(300, 200, 384));
    assertEquals(1, EscPosRaster.scaledHeight(1000, 1, 384)); // minimal 1 dot
  }

  @Test
  public void rejectsInvalidDimensions() {
    assertThrows(IllegalArgumentException.class, () -> EscPosRaster.fromArgb(0, 1, new int[0], 128));
    assertThrows(IllegalArgumentException.class, () -> EscPosRaster.fromArgb(8, 8, new int[10], 128));
  }
}
