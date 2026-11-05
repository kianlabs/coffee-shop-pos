# HPP yang Bisa Diatur User

Status: **implemented** (DB v4). HPP tidak lagi wajib berasal dari resep.

## Tiga mode per produk

| Mode | Arti | Kapan dipakai |
|------|------|---------------|
| `manual` | User mengetik sendiri angka HPP per unit | Warung yang tahu "kopi susu HPP 6.000" tanpa mencatat resep |
| `recipe` | Dihitung otomatis dari resep aktif × harga bahan terakhir | Yang mau HPP ikut naik/turun bersama harga pasar |
| `none` | Tidak dilacak | Produk titipan / jual putus yang HPP-nya tidak diketahui |

Varian punya mode tambahan `inherit` (default) = ikut konfigurasi produk induk.
Presedence: **mode varian (selain `inherit`) > mode produk**.

## Aturan resolusi

`src/domain/hppResolve.ts#resolveHpp`

1. `manual` → pakai `hpp_manual_rp` apa adanya (dijepit ≥ 0, dibulatkan ke bawah).
2. `recipe` → pakai HPP resep bila ada dan > 0. Bila resep kosong → jatuh ke
   HPP manual (bila > 0), kalau tidak ada juga → 0 dengan catatan.
3. `none` → 0.

HPP selalu **integer Rupiah**. Desimal dipotong (`Math.trunc`), bukan dibulatkan,
supaya angka yang diketik user tidak berubah diam-diam.

## Snapshot saat transaksi

`order_items` menyimpan empat nilai pada saat jual:

- `hpp_unit_rp` — HPP per 1 unit (sudah final)
- `hpp_total_rp` — `hpp_unit_rp × quantity` (kolom lama V1, sekarang benar-benar terisi)
- `hpp_source` — `manual` | `recipe` | `none`
- `hpp_detail_json` — rincian bahan untuk mode resep (`{version, lines[]}`)

Konsekuensi: menaikkan harga bahan **tidak** mengubah laba transaksi lama.
Laporan laba historis stabil.

Bila pembacaan konfigurasi HPP gagal, penjualan tetap jalan dengan
`hpp_source = 'none'` dan alasan error tersimpan di `hpp_detail_json`
(`{"error": "..."}`) — kasir tidak boleh terblokir gara-gara HPP.

## Alur tulis

`src/data/productRepo.ts`

- `loadHppProducts()` — produk + varian + HPP efektif + biaya resep, untuk layar editor.
- `saveHppDrafts(drafts)` — simpan banyak perubahan dalam **satu transaksi**;
  validasi semua baris dulu, baru menulis (all-or-nothing).
- Setiap penyimpanan menulis baris `audit_logs` dengan `action = 'hpp.updated'`.

## UI

Menu **HPP** di aplikasi (`src/components/HppEditor.tsx`):

- Daftar produk per kategori, input HPP langsung, mode per produk.
- Laba/unit dan margin % dihitung live dari draft yang sedang diketik.
- Varian bisa dibuka dan diatur terpisah ("Ikut produk" / manual / resep / tanpa HPP).
- Ringkasan di atas: jumlah produk, produk tanpa HPP, produk yang HPP-nya melebihi harga jual.
- Tombol simpan menampilkan jumlah perubahan yang belum disimpan.

## Migrasi

`UPGRADE_V4` di `src/data/migrations.ts`, dijalankan lewat dua jalur:

1. Fresh install → upgrade statement Capacitor (`toVersion: 4`).
2. DB lama → `ensureV4Columns()` di `src/data/db.ts` mengecek `PRAGMA table_info`
   sebelum `ALTER TABLE`, karena SQLite tidak punya `ADD COLUMN IF NOT EXISTS`.

Kolom baru:

```
products          : hpp_mode, hpp_manual_rp, hpp_updated_at
product_variants  : hpp_mode, hpp_manual_rp, hpp_updated_at
order_items       : hpp_unit_rp, hpp_source, hpp_detail_json
```

## Yang belum ada

- Laporan laba agregat per periode (data snapshot sudah siap, tinggal query).
- Editor resep di UI (tabel `recipes`/`recipe_items` sudah ada, belum ada layar).
- HPP per bahan baku dalam satu layar (saat ini lewat `stock.ts#recordPurchase`).
