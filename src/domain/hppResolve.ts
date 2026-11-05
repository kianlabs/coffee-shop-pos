import type { Rupiah } from "./money";

/**
 * Resolusi HPP per unit jual.
 *
 * Tiga mode, dipilih user per produk:
 * - `manual` — user mengisi sendiri angka HPP-nya (paling umum untuk warung kopi).
 * - `recipe` — dihitung otomatis dari resep × harga bahan terakhir.
 * - `none`   — produk tidak dilacak HPP-nya.
 *
 * Varian punya mode tambahan `inherit` = ikut konfigurasi produk induk.
 * Presedence: mode varian (kecuali inherit) > mode produk.
 */
export type HppMode = "manual" | "recipe" | "none";
export type VariantHppMode = "inherit" | HppMode;
export type HppSource = HppMode;

export type HppResolution = {
  /** HPP per 1 unit jual, integer Rupiah >= 0. */
  unitHppRp: Rupiah;
  /** Dari mana angka ini berasal (dipakai untuk snapshot di order_items). */
  source: HppSource;
  /** Peringatan ringan untuk ditampilkan di UI, bukan error. */
  note: string | null;
};

export type MarginInfo = {
  profitRp: Rupiah;
  /** Laba / harga jual × 100, satu desimal. null bila harga 0. */
  marginPct: number | null;
  /** Laba / HPP × 100, satu desimal. null bila HPP 0. */
  markupPct: number | null;
};

export function clampRupiah(value: unknown): Rupiah {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const t = Math.trunc(n);
  return t > 0 ? t : 0;
}

export function isHppMode(value: unknown): value is HppMode {
  return value === "manual" || value === "recipe" || value === "none";
}

export function isVariantHppMode(value: unknown): value is VariantHppMode {
  return value === "inherit" || isHppMode(value);
}

export function resolveHpp(
  mode: HppMode,
  manualRp: Rupiah,
  recipePerUnitRp: Rupiah | null,
): HppResolution {
  const manual = clampRupiah(manualRp);

  if (mode === "manual") {
    return {
      unitHppRp: manual,
      source: "manual",
      note: manual === 0 ? "HPP manual masih 0 — isi agar laba terhitung." : null,
    };
  }

  if (mode === "recipe") {
    if (recipePerUnitRp !== null && Number.isFinite(recipePerUnitRp) && recipePerUnitRp > 0) {
      return { unitHppRp: clampRupiah(recipePerUnitRp), source: "recipe", note: null };
    }
    if (manual > 0) {
      return {
        unitHppRp: manual,
        source: "manual",
        note: "Resep kosong — memakai HPP manual sebagai cadangan.",
      };
    }
    return { unitHppRp: 0, source: "none", note: "Resep belum diisi." };
  }

  return { unitHppRp: 0, source: "none", note: null };
}

export function marginFor(priceRp: Rupiah, hppRp: Rupiah): MarginInfo {
  const price = clampRupiah(priceRp);
  const hpp = clampRupiah(hppRp);
  const profitRp = price - hpp;
  return {
    profitRp,
    marginPct: price > 0 ? Math.round((profitRp / price) * 1000) / 10 : null,
    markupPct: hpp > 0 ? Math.round((profitRp / hpp) * 1000) / 10 : null,
  };
}

export function formatPct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}
