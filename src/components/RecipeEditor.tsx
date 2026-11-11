import { useEffect, useMemo, useState } from "react";
import { formatRupiah } from "../domain/money";
import { formatPct, marginFor } from "../domain/hppResolve";
import { validateRecipeLines } from "../domain/recipe";
import {
  deleteRecipe,
  loadIngredientOptions,
  loadRecipeForProduct,
  saveRecipe,
  type IngredientOption,
} from "../data/recipeRepo";
import { Icon } from "./Icon";

type DraftLine = { ingredientId: string; qtyPerUnit: number };

type RecipeEditorProps = {
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  basePriceRp: number;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

/**
 * Editor resep per produk/varian. Takaran diisi per 1 unit jual dan memakai
 * satuan dasar bahan (g, ml, pcs, ...). Biaya memakai harga beli terakhir —
 * sama dengan resolver HPP saat checkout.
 */
export function RecipeEditor({
  productId,
  productName,
  variantId,
  variantName,
  basePriceRp,
  onClose,
  onSaved,
}: RecipeEditorProps) {
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [options, recipe] = await Promise.all([
          loadIngredientOptions(),
          loadRecipeForProduct(productId, variantId),
        ]);
        if (cancelled) return;
        setIngredients(options);
        setVersion(recipe?.version ?? null);
        if (recipe && recipe.lines.length > 0) {
          setLines(
            recipe.lines.map((l) => ({
              ingredientId: l.ingredientId,
              qtyPerUnit: l.qtyPerUnit,
            })),
          );
        } else if (options.length > 0) {
          setLines([{ ingredientId: options[0].id, qtyPerUnit: 1 }]);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Gagal memuat resep.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, variantId]);

  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  const totalPerUnit = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const ing = byId.get(line.ingredientId);
        if (!ing || !(line.qtyPerUnit > 0)) return sum;
        return sum + Math.round(line.qtyPerUnit * ing.lastCostRp);
      }, 0),
    [lines, byId],
  );

  const margin = marginFor(basePriceRp, totalPerUnit);
  const validationError = validateRecipeLines(lines);
  const canSave = !busy && lines.length > 0 && validationError === null;

  function patchLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
    setError(null);
  }

  function addLine() {
    const used = new Set(lines.map((l) => l.ingredientId));
    const next = ingredients.find((i) => !used.has(i.id));
    if (!next) {
      setError("Semua bahan sudah dipakai di resep ini.");
      return;
    }
    setLines((prev) => [...prev, { ingredientId: next.id, qtyPerUnit: 1 }]);
    setError(null);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  }

  async function handleSave() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await saveRecipe({
        productId,
        variantId,
        lines: lines.map((l) => ({
          ingredientId: l.ingredientId,
          qtyPerUnit: l.qtyPerUnit,
        })),
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan resep.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Hapus resep ${productName}${variantName ? ` ${variantName}` : ""}?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteRecipe(productId, variantId);
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus resep.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="recipe-title">
        <div className="modal-head">
          <div>
            <div className="modal-icon">
              <Icon name="calculator" size={24} />
            </div>
            <div className="modal-title" id="recipe-title">
              Resep {productName}
              {variantName ? ` · ${variantName}` : ""}
            </div>
            <div className="modal-sub">
              {version ? `Versi ${version} aktif` : "Belum ada resep"} · takaran untuk 1 unit jual
            </div>
          </div>
          <button className="modal-close" aria-label="Tutup" onClick={onClose} disabled={busy}>
            <Icon name="close" />
          </button>
        </div>

        {loading ? (
          <div className="loading-state">
            <span className="spinner" />
            Memuat resep…
          </div>
        ) : ingredients.length === 0 ? (
          <div className="empty-state" style={{ padding: "24px 12px" }}>
            <Icon name="box" size={30} />
            <h3>Belum ada bahan</h3>
            <p>Tambahkan bahan dan harga belinya dulu di layar Stok, lalu kembali ke sini.</p>
          </div>
        ) : (
          <>
            <div className="recipe-lines">
              {lines.map((line, index) => {
                const ing = byId.get(line.ingredientId);
                const lineCost =
                  ing && line.qtyPerUnit > 0 ? Math.round(line.qtyPerUnit * ing.lastCostRp) : 0;
                return (
                  <div className="recipe-line" key={`${line.ingredientId}-${index}`}>
                    <label>
                      Bahan
                      <select
                        aria-label={`Bahan baris ${index + 1}`}
                        value={line.ingredientId}
                        onChange={(e) => patchLine(index, { ingredientId: e.target.value })}
                        disabled={busy}
                      >
                        <option value="">— pilih bahan —</option>
                        {ingredients.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name} ({option.baseUnit})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Takaran {ing ? `(${ing.baseUnit})` : ""}
                      <input
                        aria-label={`Takaran baris ${index + 1}`}
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={line.qtyPerUnit || ""}
                        onChange={(e) =>
                          patchLine(index, { qtyPerUnit: Math.max(0, Number(e.target.value) || 0) })
                        }
                        disabled={busy}
                      />
                    </label>
                    <div className="recipe-line-side">
                      <span className="recipe-line-cost">
                        {formatRupiah(lineCost)}
                        {ing ? <small> @ {formatRupiah(ing.lastCostRp)}/{ing.baseUnit}</small> : null}
                      </span>
                      <button
                        className="icon-only ghost"
                        aria-label={`Hapus bahan baris ${index + 1}`}
                        onClick={() => removeLine(index)}
                        disabled={busy || lines.length <= 1}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button className="small" onClick={addLine} disabled={busy}>
              <Icon name="plus" size={15} />
              Tambah bahan
            </button>

            <div className="recipe-summary">
              <div>
                <span className="muted">HPP per unit</span>
                <strong className="money">{formatRupiah(totalPerUnit)}</strong>
              </div>
              <div>
                <span className="muted">Laba / unit</span>
                <strong className={margin.profitRp < 0 ? "is-loss" : "money"}>
                  {formatRupiah(margin.profitRp)}
                </strong>
              </div>
              <div>
                <span className="muted">Margin</span>
                <strong>{formatPct(margin.marginPct)}</strong>
              </div>
            </div>

            {validationError && lines.length > 0 && (
              <p className="danger-note" style={{ color: "var(--danger)", marginTop: 8 }}>
                {validationError}
              </p>
            )}

            {error && (
              <div className="danger-note" style={{ marginTop: 12 }} role="alert">
                <Icon name="alert" size={17} />
                <span>{error}</span>
              </div>
            )}

            <div className="modal-actions">
              {version !== null && (
                <button className="danger" onClick={() => void handleDelete()} disabled={busy}>
                  Hapus resep
                </button>
              )}
              <button className="primary" onClick={() => void handleSave()} disabled={!canSave}>
                <Icon name="check" size={17} />
                {busy ? "Menyimpan…" : "Simpan resep"}
              </button>
            </div>
          </>
        )}

        {error && ingredients.length === 0 && (
          <div className="danger-note" style={{ marginTop: 12 }} role="alert">
            <Icon name="alert" size={17} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
