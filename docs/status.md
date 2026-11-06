# Status Implementasi

Dokumen ini menggantikan klaim di blueprint awal. Yang tertulis di sini sudah
diverifikasi dengan build/test, bukan rencana.

Terakhir diperbarui: 6 November 2026.

## Sudah jalan

| Fitur | Bukti |
|-------|-------|
| Kasir offline (tambah keranjang, diskon, pajak, layanan, pembulatan, bayar, kembalian) | `npm run build` + `npm test` (110 assertion) |
| Proteksi atomik void & refund SQLite (`transaction=false`) | `src/data/orderRepository.ts` |
| Migrasi V7: penjagaan stok refund (`uq_stock_movements_ref`) & indeks komposit | `src/data/migrations.ts#UPGRADE_V7` |
| Inisialisasi DB aman dari balapan startup | `src/data/db.ts#openConnection` |
| Background sync outbox diserialkan via `runSerializedWrite` | `src/data/sync.ts` |
| Proteksi brute force PIN persisten (lockout 5 menit) & verifikasi PIN lama di Pengaturan | `src/data/settings.ts`, `src/App.tsx` |
| Proteksi crash Bluetooth Android 12+ & pencegahan OOM pada logo struk | `PrinterPlugin.java`, `proguard-rules.pro` |
| Ergonomi touch target tablet (min 40–44px untuk qty, varian, menu) | `src/styles/theme.css` |
| Menu & harga diisi sendiri oleh user (katalog kosong di awal) | `src/components/CatalogEditor.tsx`, `src/data/catalogRepo.ts` |
| Katalog dibaca dari database, bukan daftar hardcoded | `loadCatalog()` di `App.tsx` |
| Checkout atomik: order + item + pembayaran + stok + snapshot HPP dalam transaksi manual yang diserialkan | `src/data/orderRepository.ts#checkoutAtomicAsync`, `src/data/tx.ts` |
| Idempotensi checkout (double-tap tidak membuat order baru) | `idempotency_key` unik + test manual |
| HPP manual per produk/varian (user isi sendiri) | `src/components/HppEditor.tsx`, `docs/hpp.md` |
| HPP resep otomatis dari bahan | `src/domain/hpp.ts`, `prepareConsumption()` |
| Editor resep di UI (per produk/varian, versi otomatis, audit log) | `src/components/RecipeEditor.tsx`, `src/data/recipeRepo.ts` |
| Snapshot HPP terkunci saat transaksi | `order_items.hpp_unit_rp`, `hpp_source`, `hpp_detail_json` |
| Stok berkurang saat jual, kembali saat void (idempoten) | unique index `uq_stock_movements_ref`, `prepareVoidReversal()` |
| Void atomik & tahan balapan ganda | conditional status update (`WHERE id = ? AND status = 'completed'`) |
| Refund penuh atomik: status refunded, pembayaran refunded, pengembalian stok idempoten | `orderRepository.ts#refundOrderAsync`, `orderStore.ts#refund` |
| Refund atomik & tahan balapan ganda | `refundOrderAsync`: conditional status update + `order_refund` reversal marker, indicator stabilisasi status. Indikasi lintasan void vs refund terpisah lewat `reference_type` (`order_void`/`order_refund`) |
| Per-connection SQLite PRAGMAs (FK on, busy_timeout 5000, WAL di native) | `src/data/db.ts#applyConnectionPragmas` |
| Pembelian bahan + koreksi stok dari aplikasi | `src/components/StockEditor.tsx` |
| Konversi satuan input (kg↔g, l↔ml) tanpa mengubah satuan dasar tersimpan | `src/domain/units.ts`, `StockEditor.tsx` |
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
| Laporan penjualan per periode: omzet, laba, HPP, produk terlaris, metode bayar, grafik tren | `src/components/SalesReport.tsx`, `salesTrend()` di `src/domain/sales.ts`, 5 assertion tren di `npm test` |
| Smoke test UI headless: alur kasir → bayar → struk → riwayat → laporan/grafik, layout tablet & ponsel | `npm run smoke:ui` (31 cek, Chromium/CDP) |
| APK memuat bundle terbaru | `npm run android:assets` (diverifikasi lewat isi APK) |

## Belum selesai / perlu hardware

| Hal | Kondisi |
|-----|---------|
| Transport Bluetooth printer | Kode Java ditulis, **belum diuji dengan printer fisik** |
| Logo raster di struk | `EscPosRaster.java` + 8 unit test lulus; belum diuji cetak |
| Backup ke file di Android | Plugin `BackupPlugin` selesai; chooser Android belum diuji di perangkat |
| Sinkronisasi cloud | Mock server + outbox ada; server produksi belum ada |
| Konversi satuan (kg↔g) | Sudah ada untuk input pembelian/koreksi; densitas (ml↔g) belum didukung |
| Kuantitas stok | Masih REAL, dibulatkan 3 desimal tiap update (anti drift), belum integer milli |
| Test E2E perangkat | Smoke UI browser sudah ada; alur refund/resep/stok di Android belum diuji otomatis |
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
