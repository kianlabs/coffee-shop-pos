/**
 * Logika domain murni untuk resep produk & varian (tanpa DB).
 */

export type RecipeLineDraft = {
  ingredientId: string;
  qtyPerUnit: number;
};

export type RecipeDraft = {
  productId: string;
  variantId: string | null;
  lines: RecipeLineDraft[];
};

/**
 * Pembulatan kuantitas takaran resep ke 3 desimal (menghindari floating point drift).
 */
export function roundRecipeQty(qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  return Math.round(qty * 1000) / 1000;
}

/**
 * Menghitung versi resep berikutnya.
 * Jika belum ada versi (null/undefined/< 1), mulai dari 1.
 * Jika sudah ada versi sebelumnya, naik 1 (version + 1).
 */
export function nextRecipeVersion(currentVersion: number | null | undefined): number {
  if (currentVersion == null || !Number.isFinite(currentVersion) || currentVersion < 1) {
    return 1;
  }
  return Math.trunc(currentVersion) + 1;
}

/**
 * Validasi baris-baris resep.
 * Mengembalikan pesan error (string bahasa Indonesia) jika tidak valid, atau null jika valid.
 *
 * Aturan:
 * - Harus ada minimal 1 baris resep.
 * - Tiap baris harus memiliki ingredientId yang valid.
 * - qtyPerUnit harus angka berhingga dan > 0.
 * - Tidak boleh ada ingredientId yang duplikat dalam satu resep.
 */
export function validateRecipeLines(lines: RecipeLineDraft[]): string | null {
  if (!Array.isArray(lines) || lines.length === 0) {
    return "Resep harus memiliki minimal satu bahan.";
  }

  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || typeof line.ingredientId !== "string" || !line.ingredientId.trim()) {
      return `Bahan pada baris ke-${i + 1} wajib dipilih.`;
    }

    const trimmedId = line.ingredientId.trim();
    if (seen.has(trimmedId)) {
      return `Bahan tidak boleh duplikat (terulang pada baris ke-${i + 1}).`;
    }
    seen.add(trimmedId);

    const qty = Number(line.qtyPerUnit);
    if (!Number.isFinite(qty) || qty <= 0) {
      return `Takaran bahan pada baris ke-${i + 1} harus lebih dari 0.`;
    }
  }

  return null;
}

/**
 * Validasi draf resep lengkap (termasuk productId).
 */
export function validateRecipeDraft(draft: RecipeDraft): string | null {
  if (!draft || typeof draft.productId !== "string" || !draft.productId.trim()) {
    return "ID produk wajib diisi.";
  }
  return validateRecipeLines(draft.lines);
}
