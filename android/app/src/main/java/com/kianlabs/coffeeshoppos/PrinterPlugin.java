package com.kianlabs.coffeeshoppos;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * PrinterPlugin v2 — transport nyata Bluetooth SPP (RFCOMM) untuk printer thermal ESC/POS.
 *
 * <p>Kontrak dengan TS ({@code src/data/printer.ts}):
 * <ul>
 *   <li>{@code listDevices()} → {@code { devices: [{name, address, bonded}] }}</li>
 *   <li>{@code connect({address})} → {@code { connected, name, address }}</li>
 *   <li>{@code disconnect()} → {@code {}}</li>
 *   <li>{@code status()} → {@code { connected, address, name }}</li>
 *   <li>{@code print({data})} → {@code { bytes }}; reject bila belum terhubung</li>
 *   <li>{@code printLogo({dataPngBase64})} → {@code { width, height }} (raster GS v 0)</li>
 *   <li>{@code checkPermissions()} → {@code { bluetooth, granted }}</li>
 * </ul>
 *
 * <p>Semua operasi I/O dijalankan di satu thread executor agar tidak memblokir UI
 * dan agar urutan job cetak tidak saling menyalip.
 */
@SuppressLint("MissingPermission") // izin dicek manual via hasBluetoothPermission()
@CapacitorPlugin(
  name = "PrinterPlugin",
  permissions = {
    @Permission(
      alias = "bluetooth",
      strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN }
    )
  }
)
public class PrinterPlugin extends Plugin {

  private static final String TAG = "PrinterPlugin";

  /** UUID standar Serial Port Profile (SPP) — dipakai semua printer thermal BT. */
  private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

  /** Batas waktu connect; socket ditutup paksa kalau lewat (printer sering hang). */
  private static final int CONNECT_TIMEOUT_MS = 15_000;

  /** Ukuran chunk tulis: printer murah buffer-nya kecil, kirim sekaligus bisa korup. */
  private static final int WRITE_CHUNK = 1024;

  private static final int LOGO_MAX_BYTES = 700_000; // ±512KB PNG

  private final Object stateLock = new Object();
  private BluetoothSocket socket;
  private OutputStream output;
  private String connectedAddress;
  private String connectedName;
  private volatile boolean connectTimedOut = false;

  private ExecutorService io;

  // ---------------------------------------------------------------- permission

  /** API < 31 memakai izin install-time (BLUETOOTH/BLUETOOTH_ADMIN), tanpa dialog. */
  private boolean hasBluetoothPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
    return (
      ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) ==
      PackageManager.PERMISSION_GRANTED
    );
  }

  @PluginMethod
  @PermissionCallback
  @Override
  public void checkPermissions(PluginCall call) {
    JSObject ret = new JSObject();
    boolean granted = hasBluetoothPermission();
    ret.put("granted", granted);
    if (granted) {
      ret.put("bluetooth", PermissionState.GRANTED.toString());
    } else {
      PermissionState state = getPermissionState("bluetooth");
      ret.put("bluetooth", (state == null ? PermissionState.PROMPT : state).toString());
    }
    call.resolve(ret);
  }

  @PluginMethod
  @Override
  public void requestPermissions(PluginCall call) {
    if (hasBluetoothPermission()) {
      resolvePermission(call);
      return;
    }
    requestPermissionForAlias("bluetooth", call, "bluetoothPermissionCallback");
  }

  @PermissionCallback
  private void bluetoothPermissionCallback(PluginCall call) {
    if (!hasBluetoothPermission()) {
      call.reject(
        "Izin Bluetooth ditolak. Buka Pengaturan > Aplikasi > Coffee Shop POS > Izin, " +
        "lalu aktifkan \"Perangkat di sekitar\"."
      );
      return;
    }
    // Lanjutkan aksi yang tertunda (connect/listDevices) setelah izin diberikan.
    String method = call.getMethodName();
    if ("connect".equals(method)) {
      connect(call);
    } else if ("listDevices".equals(method)) {
      listDevices(call);
    } else {
      resolvePermission(call);
    }
  }

  private void resolvePermission(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("granted", true);
    ret.put("bluetooth", PermissionState.GRANTED.toString());
    call.resolve(ret);
  }

  // ------------------------------------------------------------------ methods

  @PluginMethod
  public void listDevices(PluginCall call) {
    if (!hasBluetoothPermission()) {
      requestPermissions(call);
      return;
    }
    BluetoothAdapter adapter = adapter();
    if (adapter == null) {
      call.reject("Perangkat ini tidak mendukung Bluetooth.");
      return;
    }
    if (!adapter.isEnabled()) {
      call.reject("Bluetooth mati. Nyalakan Bluetooth lalu coba lagi.");
      return;
    }
    try {
      Set<BluetoothDevice> bonded = adapter.getBondedDevices();
      JSArray devices = new JSArray();
      if (bonded != null) {
        for (BluetoothDevice d : bonded) {
          JSObject item = new JSObject();
          String name = d.getName();
          item.put("name", name == null || name.isEmpty() ? "(tanpa nama)" : name);
          item.put("address", d.getAddress());
          item.put("bonded", d.getBondState() == BluetoothDevice.BOND_BONDED);
          devices.put(item);
        }
      }
      JSObject ret = new JSObject();
      ret.put("devices", devices);
      call.resolve(ret);
    } catch (SecurityException e) {
      call.reject(securityMessage(), e);
    }
  }

  @PluginMethod
  public void connect(final PluginCall call) {
    if (!hasBluetoothPermission()) {
      requestPermissions(call);
      return;
    }
    final String address = call.getString("address");
    if (address == null || address.trim().isEmpty()) {
      call.reject("Alamat Bluetooth printer wajib diisi.");
      return;
    }
    final BluetoothAdapter adapter = adapter();
    if (adapter == null) {
      call.reject("Perangkat ini tidak mendukung Bluetooth.");
      return;
    }
    if (!adapter.isEnabled()) {
      call.reject("Bluetooth mati. Nyalakan Bluetooth lalu coba lagi.");
      return;
    }

    io().execute(() -> {
      BluetoothDevice device;
      try {
        device = adapter.getRemoteDevice(address.trim());
      } catch (IllegalArgumentException e) {
        call.reject("Alamat Bluetooth tidak valid: " + address);
        return;
      }

      // Satu printer hanya bisa dipegang satu socket — tutup sesi lama dulu.
      closeQuietly();

      BluetoothSocket newSocket = null;
      try {
        try {
          if (adapter.isDiscovering()) {
            adapter.cancelDiscovery(); // discovery memperlambat/menggagalkan connect
          }
        } catch (SecurityException se) {
          Log.w(TAG, "Gagal membatalkan discovery (tidak ada izin scan, abaikan): " + se.getMessage());
        }
        newSocket = device.createRfcommSocketToServiceRecord(SPP_UUID);
        connectWithTimeout(newSocket);
        OutputStream out = newSocket.getOutputStream();
        String name = device.getName();
        synchronized (stateLock) {
          socket = newSocket;
          output = out;
          connectedAddress = device.getAddress();
          connectedName = name == null || name.isEmpty() ? "(tanpa nama)" : name;
        }
        JSObject ret = new JSObject();
        ret.put("connected", true);
        ret.put("name", connectedName);
        ret.put("address", connectedAddress);
        call.resolve(ret);
      } catch (SecurityException e) {
        closeSocket(newSocket);
        call.reject(securityMessage(), e);
      } catch (IOException e) {
        closeSocket(newSocket);
        String suffix = connectTimedOut
          ? "Koneksi timeout " + (CONNECT_TIMEOUT_MS / 1000) + " detik."
          : "Pastikan printer menyala, tidak sedang terhubung ke HP/tablet lain, dan sudah dipasangkan (paired).";
        call.reject("Gagal terhubung ke printer " + address + ". " + suffix, e);
      } catch (Exception e) {
        closeSocket(newSocket);
        call.reject("Gagal terhubung ke printer: " + e.getMessage(), e);
      }
    });
  }

  @PluginMethod
  public void disconnect(final PluginCall call) {
    io().execute(() -> {
      closeQuietly();
      call.resolve(new JSObject());
    });
  }

  @PluginMethod
  public void status(final PluginCall call) {
    io().execute(() -> {
      JSObject ret = new JSObject();
      synchronized (stateLock) {
        ret.put("connected", output != null && socket != null && socket.isConnected());
        ret.put("address", connectedAddress);
        ret.put("name", connectedName);
      }
      call.resolve(ret);
    });
  }

  @PluginMethod
  public void print(final PluginCall call) {
    final String data = call.getString("data");
    if (data == null || data.isEmpty()) {
      call.reject("data wajib base64 ESC/POS non-kosong.");
      return;
    }
    if (!isConnected()) {
      call.reject("Printer belum terhubung. Hubungkan printer dulu di Pengaturan Printer.");
      return;
    }
    final byte[] bytes;
    try {
      bytes = Base64.decode(data, Base64.DEFAULT);
    } catch (IllegalArgumentException e) {
      call.reject("data bukan base64 valid.");
      return;
    }
    if (bytes.length == 0) {
      call.reject("data ESC/POS kosong.");
      return;
    }

    io().execute(() -> {
      try {
        writeAll(bytes);
        JSObject ret = new JSObject();
        ret.put("bytes", bytes.length);
        call.resolve(ret);
      } catch (IOException e) {
        closeQuietly();
        call.reject("Koneksi printer terputus saat mencetak. Hubungkan ulang lalu coba lagi.", e);
      }
    });
  }

  @PluginMethod
  public void printLogo(final PluginCall call) {
    final String png = call.getString("dataPngBase64");
    if (png == null || png.isEmpty()) {
      call.reject("dataPngBase64 wajib PNG base64 non-kosong.");
      return;
    }
    if (png.length() > LOGO_MAX_BYTES) {
      call.reject("Logo PNG melebihi 512KB.");
      return;
    }
    if (!isConnected()) {
      call.reject("Printer belum terhubung. Hubungkan printer dulu di Pengaturan Printer.");
      return;
    }

    final byte[] raw;
    try {
      raw = Base64.decode(png, Base64.DEFAULT);
    } catch (IllegalArgumentException e) {
      call.reject("dataPngBase64 bukan base64 valid.");
      return;
    }

    io().execute(() -> {
      // Periksa dimensi tanpa alokasi memori penuh
      BitmapFactory.Options boundsOpts = new BitmapFactory.Options();
      boundsOpts.inJustDecodeBounds = true;
      BitmapFactory.decodeByteArray(raw, 0, raw.length, boundsOpts);
      if (boundsOpts.outWidth <= 0 || boundsOpts.outHeight <= 0) {
        call.reject("File gambar logo tidak valid.");
        return;
      }
      if (boundsOpts.outWidth > 2048 || boundsOpts.outHeight > 2048) {
        call.reject("Dimensi logo terlalu besar (maksimal 2048x2048 piksel).");
        return;
      }

      // Decode di thread I/O dengan pengaman OutOfMemoryError
      final Bitmap decoded;
      try {
        decoded = BitmapFactory.decodeByteArray(raw, 0, raw.length);
      } catch (OutOfMemoryError oom) {
        call.reject("Memori perangkat tidak mencukupi untuk memproses logo.");
        return;
      }
      if (decoded == null) {
        call.reject("PNG tidak bisa di-decode.");
        return;
      }
      Bitmap work = decoded;
      try {
        int w = work.getWidth();
        int h = work.getHeight();
        if (w > EscPosRaster.MAX_WIDTH_58MM) {
          int newH = EscPosRaster.scaledHeight(w, h, EscPosRaster.MAX_WIDTH_58MM);
          Bitmap scaled = Bitmap.createScaledBitmap(work, EscPosRaster.MAX_WIDTH_58MM, newH, true);
          if (scaled != work) work.recycle();
          work = scaled;
          w = work.getWidth();
          h = work.getHeight();
        }
        int[] pixels = new int[w * h];
        work.getPixels(pixels, 0, w, 0, 0, w, h);
        byte[] raster = EscPosRaster.fromArgb(w, h, pixels, EscPosRaster.DEFAULT_THRESHOLD);
        writeAll(raster);
        JSObject ret = new JSObject();
        ret.put("width", EscPosRaster.paddedWidth(w));
        ret.put("height", h);
        call.resolve(ret);
      } catch (OutOfMemoryError oom) {
        call.reject("Memori tidak mencukupi saat meraster logo.");
      } catch (IOException e) {
        closeQuietly();
        call.reject("Koneksi printer terputus saat mencetak logo. Hubungkan ulang lalu coba lagi.", e);
      } catch (IllegalArgumentException e) {
        call.reject("Logo tidak bisa diproses: " + e.getMessage(), e);
      } finally {
        if (work != decoded) work.recycle();
        decoded.recycle();
      }
    });
  }

  // ------------------------------------------------------------------ helpers

  private BluetoothAdapter adapter() {
    BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
    return manager == null ? null : manager.getAdapter();
  }

  private boolean isConnected() {
    synchronized (stateLock) {
      return socket != null && output != null && socket.isConnected();
    }
  }

  private ExecutorService io() {
    synchronized (stateLock) {
      if (io == null) {
        io = Executors.newSingleThreadExecutor(r -> {
          Thread t = new Thread(r, "printer-io");
          t.setDaemon(true);
          return t;
        });
      }
      return io;
    }
  }

  /** connect() tidak punya parameter timeout; tutup socket dari watchdog untuk membatalkan. */
  private void connectWithTimeout(BluetoothSocket s) throws IOException {
    connectTimedOut = false;
    final AtomicBoolean finished = new AtomicBoolean(false);
    Thread watchdog = new Thread(() -> {
      try {
        Thread.sleep(CONNECT_TIMEOUT_MS);
        if (!finished.get()) {
          connectTimedOut = true;
          try {
            s.close();
          } catch (IOException ignored) {
            // sudah tertutup
          }
        }
      } catch (InterruptedException ignored) {
        // connect selesai lebih cepat
      }
    }, "printer-connect-watchdog");
    watchdog.setDaemon(true);
    watchdog.start();
    try {
      s.connect();
    } finally {
      finished.set(true);
      watchdog.interrupt();
    }
  }

  /** Tulis bertahap + flush; printer murah bisa korup kalau diborong sekaligus. */
  private void writeAll(byte[] data) throws IOException {
    OutputStream out;
    synchronized (stateLock) {
      out = output;
    }
    if (out == null) throw new IOException("Printer belum terhubung.");
    for (int off = 0; off < data.length; off += WRITE_CHUNK) {
      int len = Math.min(WRITE_CHUNK, data.length - off);
      out.write(data, off, len);
      out.flush();
      if (off + len < data.length) {
        try {
          Thread.sleep(15);
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
          throw new IOException("Cetak dibatalkan.");
        }
      }
    }
  }

  private void closeQuietly() {
    BluetoothSocket s;
    synchronized (stateLock) {
      s = socket;
      socket = null;
      output = null;
      connectedAddress = null;
      connectedName = null;
    }
    closeSocket(s);
  }

  private void closeSocket(BluetoothSocket s) {
    if (s == null) return;
    try {
      s.close();
    } catch (IOException e) {
      Log.w(TAG, "Gagal menutup socket printer: " + e.getMessage());
    }
  }

  private String securityMessage() {
    return (
      "Izin Bluetooth ditolak sistem. Buka Pengaturan > Aplikasi > Coffee Shop POS > Izin, " +
      "aktifkan \"Perangkat di sekitar\", lalu coba lagi."
    );
  }

  @Override
  protected void handleOnDestroy() {
    closeQuietly();
    synchronized (stateLock) {
      if (io != null) {
        io.shutdownNow();
        io = null;
      }
    }
    super.handleOnDestroy();
  }
}
