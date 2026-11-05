# Backup and Recovery

## Yang benar-benar diimplementasikan
- **Backup manual**: tombol Backup mengekspor JSON (`repo.exportJson()`) dan mengunduhnya sebagai file; riwayat backup lokal dicatat lewat `rememberBackup()`. Tidak ada penjadwalan otomatis.
- **Backup terenkripsi (opsional)**: passphrase diisi user, lalu `src/data/cryptoBackup.ts` mengenkripsi JSON tersebut sebelum diunduh. Restore mendeteksi format otomatis (`isEncryptedBackup`).
- **Restore**: file dibaca, didekripsi bila terenkripsi, lalu **menimpa** data saat ini setelah konfirmasi. Restore belum memakai database terpisah + verifikasi bertahap seperti prosedur ideal di bawah.

## Format enkripsi (`pos-enc-v2`)
| Parameter | Nilai |
|---|---|
| Cipher | AES-GCM 256-bit |
| KDF | PBKDF2-HMAC-SHA256, **600.000** iterasi (OWASP 2023) |
| Salt | 16 byte acak, baru setiap enkripsi |
| IV / nonce | 12 byte acak, baru setiap enkripsi |
| Integritas | auth tag AES-GCM + **checksum SHA-256** plaintext di header |
| Metadata header | `appVersion`, `schemaVersion`, `createdAt`, `iterations` |

- `iterations` disimpan di header dan dibaca saat dekripsi, jadi menaikkan default tidak merusak backup lama.
- Checksum dihitung dari plaintext **sebelum** enkripsi dan diverifikasi setelah dekripsi; kalau tidak cocok, dekripsi ditolak (`Checksum backup tidak cocok`).
- Salt/IV yang panjangnya bukan 16/12 byte ditolak saat dekripsi.
- Format lama `pos-enc-v1` (tanpa `iterations`, checksum, dan metadata) masih bisa dibuka dengan asumsi PBKDF2 100k. Backup v1 tidak punya checksum aplikasi — integritasnya hanya auth tag AES-GCM.
- Passphrase salah → `Passphrase salah atau file rusak.` (AES-GCM gagal autentikasi).

## Batasan yang harus diketahui owner
- **API key sync disimpan plaintext di `localStorage`** (tanpa dependency secure storage). Jangan pakai passphrase yang sama dengan kredensial lain.
- **Tidak ada key management / recovery key**: passphrase hilang = backup terenkripsi tidak bisa dibuka. Tidak ada escrow.
- **Tidak ada cloud backup**, tidak ada upload otomatis, tidak ada retensi/rotasi otomatis.
- **Tidak ada verifikasi restore otomatis** (checksum SQLite, jumlah record, uji order terakhir) — verifikasi masih manual.
- Backup berisi data order; file hasil unduhan berada di storage perangkat/komputer dan di luar kendali aplikasi.

## Prosedur operasional yang disarankan
1. Backup manual minimal harian dan sebelum upgrade aplikasi/migrasi skema.
2. Simpan lebih dari satu salinan known-good di media berbeda; jangan menimpa satu-satunya salinan.
3. Catat passphrase di tempat aman di luar perangkat (password manager milik owner).
4. Setelah restore, uji: buka riwayat order, cek order terakhir, pembayaran, snapshot HPP, dan pergerakan stok.

## Prosedur restore ideal (target, belum otomatis)
1. Setop penulisan / mode maintenance.
2. Simpan database saat ini sebagai salinan forensik.
3. Restore ke database terpisah.
4. Verifikasi checksum file, `PRAGMA integrity_check`, versi skema, dan jumlah record.
5. Validasi order/pembayaran/HPP/stok terbaru.
6. Baru tukar database setelah validasi dan persetujuan.
7. Catat restore di audit log.

## Recovery caveat
Kalau tablet hilang/rusak saat offline, transaksi setelah backup eksternal terakhir bisa hilang permanen. Jelaskan batasan ini ke owner sebelum operasional.
