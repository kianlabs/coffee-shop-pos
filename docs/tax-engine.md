# Tax_Engine: diskon, pajak, biaya layanan, pembulatan

Status: **domain siap**, belum dipakai checkout. Kode: `src/domain/taxEngine.ts`,
`src/domain/taxEngineInput.ts`, `src/domain/rounding.ts`.

## Aturan dasar

- Semua nominal adalah **integer Rupiah**. Tarif (pajak, biaya layanan, diskon
  persen) adalah **integer basis poin** 0–10.000 (0–100%).
- Setiap nilai dari persen atau basis poin dibulatkan **secara terpisah** ke
  Rupiah terdekat, **setengah ke atas** (sisa ≥ 0,5 Rp naik):
  `divRoundHalfUp(n, d)`. Contoh: 14.999 × 1 bp → `divRoundHalfUp(14_999, 10_000)` = 1.
- Hasil antara yang melewati `Number.MAX_SAFE_INTEGER` (2^53 − 1) melempar
  `RangeError`; nilai tidak pernah dibulatkan diam-diam oleh floating point.
- Masukan tidak valid (tarif di luar 0–10.000 bp, diskon nominal di luar
  0–999.999.999, harga/jumlah bukan integer, kunci baris ganda) melempar
  `RangeError`. UI wajib memvalidasi lebih dulu; `discountError()` memberi
  pesan rentang yang bisa ditampilkan.

## Urutan operasi `computeTotals`

Hanya ada satu urutan:

1. **Urut kanonis**: baris diurutkan menurut `key` (perbandingan kode karakter,
   tidak bergantung locale). Ini yang membuat hasil sama untuk urutan Cart apa pun.
2. **Bruto**: `gross_i = (unitPriceRp + adjustmentsRp) × qty`;
   `subtotal = Σ gross_i`.
3. **Diskon per item**: persen = `divRoundHalfUp(gross_i × bp, 10.000)`, nominal
   apa adanya; dibatasi `≤ gross_i` (menyalakan `clamped.item`).
4. **Diskon promo** (`PromoResult.discountsRp[key]`): dibatasi sisa baris setelah
   diskon item sehingga baris tidak negatif. `PromoResult` dengan `ok: false`
   dianggap tanpa promo. Kunci promo yang tidak ada di Cart diabaikan.
5. **Diskon order**: dihitung atas `Σ` baris setelah promo, dibatasi sama dengan
   nilai tersebut (menyalakan `clamped.order`), lalu dibagi ke baris dengan
   `allocateDiscount` (`src/domain/orders.ts`) dalam urutan kanonis. Hasilnya `net_i`.
6. **Biaya layanan** (bila aktif): `base = Σ net_i`;
   `layanan = divRoundHalfUp(base × serviceRateBp, 10.000)`.
7. **Pajak**, dasar = `base` atau `base + layanan` sesuai `taxBase`:
   - `exclusive`: `pajak = divRoundHalfUp(dasar × taxRateBp, 10.000)`, ditambahkan ke total.
   - `inclusive`: `netOfTax = divRoundHalfUp(dasar × 10.000, 10.000 + taxRateBp)`,
     komponen = `dasar − netOfTax`. Komponen hanya informasi di struk;
     `taxExclusiveRp = 0`.
   - `off`: keduanya 0.
8. **Pembulatan** (bila `roundingStep` 100/500/1.000):
   `pre = base + layanan + pajak eksklusif`; `roundToMultiple(pre, step)` ke
   kelipatan terdekat, setengah ke atas. `roundingRp = hasil − pre`, bisa negatif,
   `|roundingRp| ≤ step / 2`. `total = pre + roundingRp`.
9. **`chargeTotalRp` per baris**: `totalRp` dibagi ke baris sebanding `net_i`
   dengan metode sisa terbesar (seri ke baris kanonis lebih awal), sehingga
   `Σ chargeTotalRp = totalRp`. Ini sama dengan `net_i` ditambah bagian layanan,
   pajak eksklusif, dan pembulatan, dalam satu langkah alokasi. Nilai ini dasar
   refund parsial.

## Invarian

- `total = subtotal − diskon + pajak eksklusif + layanan + pembulatan`, dengan
  `diskon = item + promo + order`, dan `total ≥ 0`.
- Bila semua baris bernilai 0 setelah diskon, layanan, pajak, pembulatan, dan
  total semuanya 0.
- Hasil identik untuk setiap permutasi baris (properti konfluensi).

## Contoh

Pajak eksklusif 11% atas dasar + layanan, layanan 5%, pembulatan 100:

| Langkah | Nilai |
|---|---|
| Baris a: 18.000 × 2, diskon 10% | bruto 36.000, diskon 3.600 |
| Baris b: (25.000 + 5.000) × 1, diskon Rp40.000 | bruto 30.000, diskon dibatasi 30.000 |
| Diskon order Rp5.000 | semua ke baris a; net a = 27.400 |
| Layanan 5% × 27.400 | 1.370 |
| Pajak 11% × 28.770 = 3.164,7 | 3.165 |
| Sebelum pembulatan | 31.935 |
| Pembulatan ke 100 | −35, total 31.900 |

## Pembayaran (`src/domain/payments.ts`)

`validatePayments(total, payments, { maxPerOrder })` memeriksa pembayaran sesuai
urutan input. Sisa tagihan = total − pembayaran sebelumnya.

- Nominal wajib integer 1–999.999.999 Rupiah.
- Jumlah pembayaran ≤ `pembayaran.maks_per_order` (1–20, default 10).
- Non-tunai tidak boleh melebihi sisa tagihan saat itu.
- Tunai yang melebihi sisa menghasilkan kembalian = tunai − sisa; sisa jadi 0.
- Pembayaran setelah sisa 0 ditolak (tagihan sudah lunas).
- Jumlah kurang dari total ditolak dengan `remainingRp` untuk ditampilkan.
- Hasil sah memenuhi `Σ bayar − kembalian = total`, kembalian > 0 hanya bila ada tunai.

`suggestCashAmounts(total)` memberi tombol nominal cepat: "uang pas" lebih dulu,
lalu sampai empat nominal lebih besar dari kelipatan 5.000, 10.000, 50.000, dan
100.000 di atas total. Total ≤ 0 atau di atas 999.999.999 menghasilkan daftar kosong.
