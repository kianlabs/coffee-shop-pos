# Status Implementasi

Dokumen ini menggantikan klaim di blueprint awal. Yang tertulis di sini sudah
diverifikasi dengan build/test, bukan rencana.

Terakhir diperbarui: 5 November 2026.

## Sudah jalan

| Fitur | Bukti |
|-------|-------|
| Kasir offline (tambah keranjang, diskon, pajak, layanan, pembulatan, bayar, kembalian) | `npm run build` + `npm test` (41 assertion) |
| Checkout atomik: order + item + pembayaran + stok + snapshot HPP dalam satu transaksi | `src/data/orderRepository.ts#checkoutAtomicAsync` |
| Idempotensi checkout (double-tap tidak membuat order baru) | `idempotency_key` unik + test manual |
| HPP manual per produk/varian (user isi sendiri) | `src/components/HppEditor.tsx`, `docs/hpp.md` |
| HPP resep otomatis dari bahan | `src/domain/hpp.ts`, `prepareConsumption()` |
| Snapshot HPP terkunci saat transaksi | `order_items.hpp_unit_rp`, `hpp_source`, `hpp_detail_json` |
| Stok berkurang saat jual, kembali saat void (idempoten) | unique index `uq_stock_movements_ref`, `prepareVoidReversal()` |
| Pembelian bahan + koreksi stok dari aplikasi | `src/components/StockEditor.tsx` |
| Rekap shift + tutup shift memakai seluruh order | `repo.loadAll()`, `handleCloseShift` |
| Struk 58mm: nama panjang tidak memotong qty, ESC/POS disanitasi, CP437 | `src/data/receipt.ts`, `src/data/printer.ts` |
| Cetak otomatis setelah bayar (bisa dimatikan) | `posSettings.autoPrint` |
| Backup JSON membawa order + master data + HPP + setelan | `exportBackupJsonAsync` (schemaVersion 2) |
| Restore: urutan DELETE benar, audit tidak dihapus, event void dibuat ulang | `importBackupJsonAsync` |
| Keranjang & shift bertahan saat app ditutup | `posCart`/`posShift` di localStorage |
| Error boundary (tidak ada layar putih) | `src/components/ErrorBoundary.tsx` |

## Belum selesai / perlu hardware

| Hal | Kondisi |
|-----|---------|
| Transport Bluetooth printer | Kode Java ditulis, **belum diuji dengan printer fisik** |
| Logo raster di struk | Bergantung rasterisasi di plugin; belum diuji cetak |
| Backup ke file di Android | Masih unduh lewat browser; perlu plugin Filesystem/Share |
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
