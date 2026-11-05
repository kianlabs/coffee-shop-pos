# Status Implementasi

Dokumen ini menggantikan klaim di blueprint awal. Yang tertulis di sini sudah
diverifikasi dengan build/test, bukan rencana.

Terakhir diperbarui: 5 November 2026.

## Sudah jalan

| Fitur | Bukti |
|-------|-------|
| Kasir offline (tambah keranjang, diskon, pajak, layanan, pembulatan, bayar, kembalian) | `npm run build` + `npm test` (62 assertion) |
| Menu & harga diisi sendiri oleh user (katalog kosong di awal) | `src/components/CatalogEditor.tsx`, `src/data/catalogRepo.ts` |
| Katalog dibaca dari database, bukan daftar hardcoded | `loadCatalog()` di `App.tsx` |
| Checkout atomik: order + item + pembayaran + stok + snapshot HPP dalam transaksi manual yang diserialkan | `src/data/orderRepository.ts#checkoutAtomicAsync`, `src/data/tx.ts` |
| Idempotensi checkout (double-tap tidak membuat order baru) | `idempotency_key` unik + test manual |
| HPP manual per produk/varian (user isi sendiri) | `src/components/HppEditor.tsx`, `docs/hpp.md` |
| HPP resep otomatis dari bahan | `src/domain/hpp.ts`, `prepareConsumption()` |
| Snapshot HPP terkunci saat transaksi | `order_items.hpp_unit_rp`, `hpp_source`, `hpp_detail_json` |
| Stok berkurang saat jual, kembali saat void (idempoten) | unique index `uq_stock_movements_ref`, `prepareVoidReversal()` |
| Void atomik & tahan balapan ganda | conditional status update (`WHERE id = ? AND status = 'completed'`) |
| Per-connection SQLite PRAGMAs (FK on, busy_timeout 5000, WAL di native) | `src/data/db.ts#applyConnectionPragmas` |
| Pembelian bahan + koreksi stok dari aplikasi | `src/components/StockEditor.tsx` |
| Semua tulis SQLite (checkout, void, katalog, HPP, stok) melewati satu antrean serial | `runSerializedWrite()` di `src/data/tx.ts` |
| Rekap shift + tutup shift memakai seluruh order | `repo.loadAll()`, `handleCloseShift` |
| Struk 58mm: nama panjang tidak memotong qty, ESC/POS disanitasi, CP437 | `src/data/receipt.ts`, `src/data/printer.ts` |
| Cetak otomatis setelah bayar (bisa dimatikan) | `posSettings.autoPrint` |
| Backup JSON membawa order + master data + HPP + ledger stok + setelan | `exportBackupJsonAsync` (schemaVersion 3, kompatibel restore v1/v2/v3) |
| Backup tersimpan sebagai file di Android (bukan blob yang hilang) | `BackupPlugin.java` + `src/data/backupFile.ts` |
| Restore: urutan DELETE benar, audit tidak dihapus, ledger stok & cost snapshot dipulihkan | `importBackupJsonAsync` |
| Keranjang & shift bertahan saat app ditutup | `posCart`/`posShift` di localStorage |
| Error boundary (tidak ada layar putih) | `src/components/ErrorBoundary.tsx` |
| Sync: timeout 15s, single-flight, klasifikasi 2xx/409/429/4xx, event_id UUID | `src/data/sync.ts` |
| Security hardening: void PIN salted PBKDF2, sync API key in-memory/sessionStorage, CSP meta, Android networkSecurityConfig | `src/data/settings.ts`, `src/data/sync.ts`, `index.html`, `network_security_config.xml` |
| Backup terenkripsi: PBKDF2 600k, salt/IV acak, checksum SHA-256 | `src/data/cryptoBackup.ts` |
| APK memuat bundle terbaru | `npm run android:assets` (diverifikasi lewat isi APK) |

## Belum selesai / perlu hardware

| Hal | Kondisi |
|-----|---------|
| Transport Bluetooth printer | Kode Java ditulis, **belum diuji dengan printer fisik** |
| Logo raster di struk | `EscPosRaster.java` + 8 unit test lulus; belum diuji cetak |
| Backup ke file di Android | Plugin `BackupPlugin` selesai; chooser Android belum diuji di perangkat |
| Sinkronisasi cloud | Mock server + outbox ada; server produksi belum ada |
| Laporan laba agregat per periode | Data snapshot sudah siap, query/layar belum ada |
| Editor resep di UI | Tabel resep ada, layar belum |
| Konversi satuan (kg↔g) | Belum ada; satuan masih teks bebas |
| Kuantitas stok | Masih REAL, dibulatkan 3 desimal tiap update (anti drift), belum integer milli |
| Test UI/end-to-end | Belum ada; yang ada hanya test domain |
| Signing release | Perlu keystore produksi (lihat `android/keystore.properties`) |

## Aturan yang dipegang

1. SQLite di tablet adalah sumber kebenaran operasional.
2. Checkout harus jalan tanpa internet.
3. Order di-commit dulu, cetak belakangan; gagal cetak tidak membatalkan penjualan.
4. Uang selalu integer Rupiah.
5. HPP di-snapshot saat jual, tidak dihitung ulang saat lapor.
6. Perubahan stok selalu berupa movement, tidak pernah UPDATE stok langsung tanpa jejak.
7. Event sinkronisasi idempoten dan disimpan sampai di-ACK.
8. Jangan klaim backup aktif sebelum diuji restore.
