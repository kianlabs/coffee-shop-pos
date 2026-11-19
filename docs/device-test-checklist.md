# Checklist Uji Perangkat

Salin berkas ini untuk setiap putaran uji (mis. `docs/device-tests/2026-12-01-<model>.md`), isi data perangkat, lalu isi kolom **Hasil**. Hasil uji perangkat diisi maintainer; berkas ini hanya templat.

## Data uji

| Isian | Nilai |
|---|---|
| Model perangkat | |
| Versi Android | |
| Versi aplikasi (Tentang) | |
| Versi skema (Tentang) | |
| Versi bundle OTA (atau "bawaan") | |
| Penguji | |
| Tanggal (YYYY-MM-DD) | |

Kolom **Hasil** hanya boleh berisi `lulus`, `gagal`, atau `tidak diuji`. Untuk setiap `gagal`, tulis langkah yang gagal dan tautan issue di kolom Catatan.

## 1. Printer Bluetooth

Merek/model printer: ____________ Lebar kertas: 58 mm / 80 mm

| # | Langkah | Hasil yang diharapkan | Hasil | Catatan |
|---|---|---|---|---|
| 1.1 | Pasangkan printer di pengaturan Bluetooth Android, lalu pilih di Pengaturan aplikasi | Printer tersimpan dan tombol uji cetak aktif | | |
| 1.2 | Cetak halaman uji | Teks terbaca, tidak terpotong di tepi kertas | | |
| 1.3 | Selesaikan order tunai, cetak struk | Struk memuat nama toko, item, total, pembayaran, kembalian | | |
| 1.4 | Cetak struk dengan nama produk panjang dan modifier | Baris dibungkus tanpa memotong angka | | |
| 1.5 | Cetak ulang struk dari riwayat | Struk sama, bertanda salinan | | |
| 1.6 | Matikan printer, selesaikan order, cetak | Order tetap tersimpan; pesan gagal cetak muncul dan tombol coba lagi tersedia | | |
| 1.7 | Hidupkan printer, tekan coba lagi | Struk tercetak sekali, tidak ganda | | |
| 1.8 | Matikan Bluetooth tablet, ulangi 1.6 | Kasir tetap berjalan; pesan jelas | | |

## 2. Backup dan restore Android

| # | Langkah | Hasil yang diharapkan | Hasil | Catatan |
|---|---|---|---|---|
| 2.1 | Backup tanpa enkripsi dari Pengaturan | Berkas JSON tersimpan di lokasi yang dipilih | | |
| 2.2 | Backup dengan passphrase | Berkas terenkripsi tersimpan; ukuran > 0 | | |
| 2.3 | Restore backup terenkripsi dengan passphrase salah | Ditolak dengan pesan passphrase salah; data tidak berubah | | |
| 2.4 | Ubah satu karakter di berkas backup, restore | Ditolak (checksum tidak cocok); data tidak berubah | | |
| 2.5 | Restore backup valid ke aplikasi yang sudah berisi data | Konfirmasi muncul; setelah restore jumlah order, omzet, dan stok sama dengan saat backup | | |
| 2.6 | Buka order terakhir, pembayaran, dan pergerakan stok | Data lengkap, HPP snapshot utuh | | |

### 2A. Backup dan restore sebelum pasang ulang (uninstall/reinstall)

Mencopot aplikasi menghapus database lokal. Lakukan bagian ini sebelum mencopot atau memasang ulang dari APK yang ditandatangani kunci lain.

| # | Langkah | Hasil yang diharapkan | Hasil | Catatan |
|---|---|---|---|---|
| 2A.1 | Catat jumlah order, total omzet, dan stok tiga bahan sebagai pembanding | Angka tercatat di bawah | | |
| 2A.2 | Tutup shift yang terbuka | Shift berstatus tutup | | |
| 2A.3 | Buat backup dengan passphrase | Berkas backup ada | | |
| 2A.4 | Salin berkas backup ke luar tablet (komputer atau penyimpanan lain), lalu buka salinannya | Salinan bisa dibuka di tempat lain; ukuran sama dengan aslinya | | |
| 2A.5 | Hitung SHA-256 berkas asli dan salinan (`sha256sum`) | Kedua hash sama | | |
| 2A.6 | Copot aplikasi, pasang APK yang dituju | Aplikasi terbuka dengan data kosong | | |
| 2A.7 | Restore dari salinan di 2A.4 dengan passphrase yang sama | Restore berhasil tanpa error | | |
| 2A.8 | Bandingkan dengan angka di 2A.1 | Order, omzet, dan stok sama persis | | |

Pembanding 2A.1: order ______  omzet Rp ______  stok bahan 1 ______  bahan 2 ______  bahan 3 ______

Jangan mencopot aplikasi sebelum 2A.5 lulus.

## 3. Pembaruan OTA

| # | Langkah | Hasil yang diharapkan | Hasil | Catatan |
|---|---|---|---|---|
| 3.1 | Tekan "Periksa Pembaruan" saat ada rilis lebih baru | Versi baru dan catatan rilis tampil dalam 15 detik | | |
| 3.2 | Tekan "Periksa Pembaruan" saat sudah terbaru | Pesan sudah versi terbaru | | |
| 3.3 | Putuskan internet, tekan "Periksa Pembaruan" | Pesan gagal terhubung; kasir tidak terganggu | | |
| 3.4 | Terapkan pembaruan, tutup dan buka aplikasi | Bundle baru aktif pada peluncuran berikutnya; versi bundle di Tentang berubah | | |
| 3.5 | Nonaktifkan pembaruan otomatis, buka ulang aplikasi | Tidak ada pemeriksaan otomatis | | |
| 3.6 | Gunakan paket uji dengan checksum salah | Ditolak, pesan gagal diverifikasi, bundle lama tetap aktif | | |
| 3.7 | Gunakan paket uji yang `schemaVersion`-nya lebih baru dari APK | Ditolak sebelum diunduh, pesan menyebut versi APK minimum | | |
| 3.8 | Gunakan paket uji yang tidak mengirim sinyal siap | Aplikasi kembali ke bundle sebelumnya dalam sekitar 10 detik; versi gagal tercatat di diagnostik | | |

## 4. Pasang APK rilis di atas rilis sebelumnya dan verifikasi sertifikat

Tujuan: memastikan APK rilis baru menimpa rilis lama tanpa kehilangan data dan ditandatangani kunci rilis yang sama.

Sidik jari SHA-256 sertifikat rilis saat ini:

```
6E:57:FB:17:04:43:73:C5:F5:2C:64:8A:59:7F:4E:FA:4C:4E:06:9E:9D:C8:2D:12:70:C5:5C:EC:ED:A3:6D:EB
```

### Persiapan (di komputer)

1. Unduh APK rilis sebelumnya (`<lama>.apk`) dan APK rilis baru (`<baru>.apk`) beserta berkas `.sha256` dari halaman GitHub Release masing-masing.
2. Cocokkan hash berkas dengan `.sha256` rilis yang sama:
   ```
   sha256sum <baru>.apk
   cat <baru>.apk.sha256
   ```
3. Verifikasi sertifikat penandatangan kedua APK dengan `apksigner` (Android SDK build-tools):
   ```
   apksigner verify --print-certs -v <lama>.apk
   apksigner verify --print-certs -v <baru>.apk
   ```
   Baca baris `Signer #1 certificate SHA-256 digest:`. Nilainya heksadesimal tanpa titik dua. Ubah sidik jari rilis ke bentuk yang sama lalu bandingkan:
   ```
   apksigner verify --print-certs <baru>.apk \
     | awk '/certificate SHA-256 digest/ {print toupper($NF)}'
   echo '6E:57:FB:17:04:43:73:C5:F5:2C:64:8A:59:7F:4E:FA:4C:4E:06:9E:9D:C8:2D:12:70:C5:5C:EC:ED:A3:6D:EB' | tr -d ':'
   ```
   Kedua keluaran harus identik.

### Di perangkat

| # | Langkah | Hasil yang diharapkan | Hasil | Catatan |
|---|---|---|---|---|
| 4.1 | Pasang `<lama>.apk` (`adb install <lama>.apk`), buat 2 order dan 1 pergerakan stok | Aplikasi berjalan; data ada | | |
| 4.2 | Lakukan bagian 2A.1 sampai 2A.5 (backup di luar tablet) | Backup tersalin dan hash cocok | | |
| 4.3 | `apksigner verify --print-certs <lama>.apk`, bandingkan SHA-256 | Sama dengan sidik jari rilis | | |
| 4.4 | `apksigner verify --print-certs <baru>.apk`, bandingkan SHA-256 | Sama dengan sidik jari rilis dan sama dengan 4.3 | | |
| 4.5 | Pasang di atas tanpa mencopot (`adb install -r <baru>.apk`) | `Success`; tidak ada `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | | |
| 4.6 | Buka aplikasi | Terbuka tanpa layar pemulihan; versi di Tentang = versi baru | | |
| 4.7 | Bandingkan order, omzet, stok dengan 4.1 | Sama persis; migrasi skema (bila ada) selesai | | |
| 4.8 | Ambil sertifikat APK terpasang: `adb shell pm path com.kianlabs.coffeeshoppos`, `adb pull <path> terpasang.apk`, lalu `apksigner verify --print-certs terpasang.apk` | SHA-256 sama dengan sidik jari rilis | | |
| 4.9 | Selesaikan satu order baru dan cetak struk | Berhasil | | |

Bila 4.5 gagal dengan `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, APK ditandatangani kunci berbeda. Hentikan, jangan mencopot aplikasi lama sebelum backup 4.2 terverifikasi, dan laporkan ke maintainer sebagai masalah rilis.

## 5. Kasir dasar (uji asap)

| # | Langkah | Hasil yang diharapkan | Hasil | Catatan |
|---|---|---|---|---|
| 5.1 | Mode pesawat aktif, selesaikan order tunai | Berhasil tanpa pesan yang meminta internet | | |
| 5.2 | Refund atau void satu order | Stok dan laporan ikut berubah | | |
| 5.3 | Putar layar dan kembali ke aplikasi dari recent apps | Keranjang tidak hilang | | |
| 5.4 | Ketuk target sentuh utama (tombol bayar, jumlah, kategori) | Terbaca dan mudah ditekan di tablet | | |

## Ringkasan

Total `lulus`: ___  `gagal`: ___  `tidak diuji`: ___

Keputusan rilis: layak / tidak layak. Penanda tangan: ____________
