package com.kianlabs.coffeeshoppos;

import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Menyimpan file backup ke storage aplikasi (tanpa izin storage) lalu
 * membagikannya lewat chooser Android.
 *
 * Kenapa perlu: di WebView Android, blob + `<a download>` tidak menghasilkan
 * file apa pun — backup POS tidak pernah benar-benar tersimpan.
 */
@CapacitorPlugin(name = "BackupPlugin")
public class BackupPlugin extends Plugin {

  private File backupDir() throws IOException {
    File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
    if (dir == null) {
      dir = new File(getContext().getFilesDir(), "backups");
    }
    if (!dir.exists() && !dir.mkdirs()) {
      throw new IOException("folder backup tidak bisa dibuat");
    }
    return dir;
  }

  /** Cegah path traversal: hanya huruf, angka, titik, garis bawah, strip. */
  private String safeName(String raw) {
    String base = raw == null ? "" : raw.replaceAll("[^A-Za-z0-9._-]", "_");
    if (base.isEmpty()) {
      base = "pos-backup-" + System.currentTimeMillis() + ".json";
    }
    return base;
  }

  @PluginMethod
  public void save(PluginCall call) {
    String content = call.getString("content");
    if (content == null) {
      call.reject("content wajib diisi.");
      return;
    }
    String fileName = safeName(call.getString("fileName"));
    try {
      File out = new File(backupDir(), fileName);
      try (FileOutputStream fos = new FileOutputStream(out)) {
        fos.write(content.getBytes(StandardCharsets.UTF_8));
        fos.flush();
      }
      JSObject ret = new JSObject();
      ret.put("path", out.getAbsolutePath());
      ret.put("bytes", out.length());
      call.resolve(ret);
    } catch (IOException e) {
      call.reject("Gagal menyimpan backup: " + e.getMessage());
    }
  }

  @PluginMethod
  public void share(PluginCall call) {
    String fileName = safeName(call.getString("fileName"));
    try {
      File file = new File(backupDir(), fileName);
      if (!file.exists()) {
        call.reject("File backup tidak ditemukan.");
        return;
      }
      Uri uri = FileProvider.getUriForFile(
        getContext(),
        getContext().getPackageName() + ".fileprovider",
        file
      );
      Intent send = new Intent(Intent.ACTION_SEND);
      send.setType("application/json");
      send.putExtra(Intent.EXTRA_STREAM, uri);
      send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      Intent chooser = Intent.createChooser(send, "Simpan / kirim backup");
      chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(chooser);
      JSObject ret = new JSObject();
      ret.put("shared", true);
      call.resolve(ret);
    } catch (Exception e) {
      call.reject("Gagal membagikan backup: " + e.getMessage());
    }
  }

  /** Daftar file backup yang ada di folder aplikasi. */
  @PluginMethod
  public void list(PluginCall call) {
    JSObject ret = new JSObject();
    com.getcapacitor.JSArray files = new com.getcapacitor.JSArray();
    try {
      File dir = backupDir();
      File[] all = dir.listFiles();
      if (all != null) {
        for (File f : all) {
          if (!f.isFile()) continue;
          JSObject item = new JSObject();
          item.put("name", f.getName());
          item.put("bytes", f.length());
          item.put("modified", f.lastModified());
          files.put(item);
        }
      }
    } catch (IOException e) {
      call.reject("Gagal membaca folder backup: " + e.getMessage());
      return;
    }
    ret.put("files", files);
    call.resolve(ret);
  }
}
