import { useEffect, useMemo, useState } from "react";
import { formatRupiah } from "../domain/money";
import type { Catalog, CatalogProduct } from "../domain/catalog";
import {
  createCategory,
  createProduct,
  createVariant,
  deactivateProduct,
  deactivateVariant,
  loadCatalog,
  updateProduct,
  updateVariant,
} from "../data/catalogRepo";
import { Icon } from "./Icon";

type Draft = { name: string; price: string; categoryId: string };

export function CatalogEditor({ onChanged }: { onChanged?: () => void }) {
  const [catalog, setCatalog] = useState<Catalog>({ categories: [], products: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [newCategory, setNewCategory] = useState("");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [draft, setDraft] = useState<Draft>({ name: "", price: "", categoryId: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>({ name: "", price: "", categoryId: "" });
  const [variantFor, setVariantFor] = useState<string | null>(null);
  const [variantName, setVariantName] = useState("");
  const [variantDelta, setVariantDelta] = useState("");
  const [query, setQuery] = useState("");

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const next = await loadCatalog();
      setCatalog(next);
      if (!draft.categoryId && next.categories[0]) {
        setDraft((d) => ({ ...d, categoryId: next.categories[0].id }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat menu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    return catalog.categories.map((c) => ({
      category: c,
      products: catalog.products.filter((p) => p.categoryId === c.id),
    }));
  }, [catalog]);

  const visibleGrouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return grouped.filter((group) => group.products.length > 0);
    return grouped
      .map((group) => ({
        ...group,
        products: group.products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.variants.some((v) => v.name.toLowerCase().includes(q)),
        ),
      }))
      .filter((group) => group.products.length > 0);
  }, [grouped, query]);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await action();
      await reload();
      onChanged?.();
      setInfo(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  function parsePrice(raw: string): number {
    const n = Number(raw.replace(/[^\d]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function startEdit(p: CatalogProduct) {
    setEditingId(p.id);
    setEditDraft({ name: p.name, price: String(p.basePriceRp), categoryId: p.categoryId });
  }

  if (loading) {
    return (
      <div className="loading-state">
        <span className="spinner" />
        Memuat menu…
      </div>
    );
  }

  return (
    <div>
      <p className="page-desc" style={{ marginBottom: 14 }}>
        Daftar menu awalnya kosong. Isi sendiri nama menu dan harganya. Menu yang tidak dijual lagi
        bisa dihapus — riwayat transaksi lama tetap utuh.
      </p>

      <div className="catalog-toolbar">
        <div className="catalog-topline" style={{ flexWrap: "wrap" }}>
          <div className="chip-row" style={{ flex: "1 1 240px" }}>
            {catalog.categories.map((category) => (
              <span key={category.id} className="chip" style={{ cursor: "default" }}>
                <Icon name="tag" size={14} />
                {category.name}
              </span>
            ))}
            {showCategoryForm ? (
              <>
                <input
                  aria-label="Nama kategori baru"
                  placeholder="Nama kategori"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value.slice(0, 60))}
                  style={{ width: 160, minHeight: 38 }}
                />
                <button
                  className="chip is-active"
                  disabled={busy || newCategory.trim() === ""}
                  onClick={() =>
                    void run(async () => {
                      await createCategory(newCategory);
                      setNewCategory("");
                      setShowCategoryForm(false);
                    }, "Kategori ditambahkan.")
                  }
                >
                  Simpan
                </button>
                <button className="chip" onClick={() => setShowCategoryForm(false)}>
                  Batal
                </button>
              </>
            ) : (
              <button className="chip" onClick={() => setShowCategoryForm(true)}>
                <Icon name="plus" size={14} />
                Kategori
              </button>
            )}
          </div>
          <div className="search-box" style={{ flex: "1 1 220px", maxWidth: 320 }}>
            <Icon name="search" />
            <input
              aria-label="Cari menu"
              placeholder="Cari menu…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query !== "" && (
              <button className="search-clear" aria-label="Hapus pencarian" onClick={() => setQuery("")}>
                <Icon name="close" size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="card menu-form">
        <div className="card-head">
          <div>
            <h3 className="card-title">Tambah menu</h3>
            <p className="card-sub">Menu langsung muncul di layar kasir setelah disimpan.</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Nama menu
            <input
              aria-label="Nama menu"
              placeholder="mis. Kopi Susu"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 80) })}
            />
          </label>
          <label>
            Harga jual (Rp)
            <input
              aria-label="Harga"
              type="number"
              min={0}
              step={500}
              inputMode="numeric"
              placeholder="mis. 18000"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            />
          </label>
          <label>
            Kategori
            <select
              aria-label="Kategori"
              value={draft.categoryId}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
            >
              {catalog.categories.length === 0 && <option value="">Belum ada kategori</option>}
              {catalog.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              className="primary block"
              style={{ minHeight: 44 }}
              disabled={busy || draft.name.trim() === "" || !draft.categoryId}
              onClick={() =>
                void run(async () => {
                  await createProduct({
                    name: draft.name,
                    categoryId: draft.categoryId || catalog.categories[0]?.id || "",
                    basePriceRp: parsePrice(draft.price),
                  });
                  setDraft({ ...draft, name: "", price: "" });
                }, `Menu "${draft.name.trim()}" ditambahkan.`)
              }
            >
              <Icon name="plus" size={17} />
              Tambah menu
            </button>
          </div>
        </div>
        {draft.price !== "" && (
          <p className="muted" style={{ marginTop: 8 }}>
            Harga jual: {formatRupiah(parsePrice(draft.price))}
          </p>
        )}
      </section>

      {catalog.products.length === 0 ? (
        <div className="empty-state">
          <Icon name="menu" size={34} />
          <h3>Belum ada menu</h3>
          <p>Tambahkan menu pertama di form atas — layar kasir akan langsung menampilkannya.</p>
        </div>
      ) : visibleGrouped.length === 0 ? (
        <div className="empty-state">
          <Icon name="search" size={32} />
          <h3>Menu tidak ditemukan</h3>
          <p>Coba kata kunci lain.</p>
          <button onClick={() => setQuery("")}>Hapus pencarian</button>
        </div>
      ) : (
        <div className="menu-groups">
          {visibleGrouped.map(({ category, products }) => (
            <section key={category.id}>
              <h3 className="menu-group-title">
                {category.name}
                <span className="badge">{products.length}</span>
              </h3>
              <div className="menu-list">
                {products.map((p) => (
                  <div key={p.id} className="menu-row">
                    {editingId === p.id ? (
                      <div className="form-grid">
                        <label>
                          Nama
                          <input
                            aria-label={`Nama ${p.name}`}
                            value={editDraft.name}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, name: e.target.value.slice(0, 80) })
                            }
                          />
                        </label>
                        <label>
                          Harga (Rp)
                          <input
                            aria-label={`Harga ${p.name}`}
                            type="number"
                            min={0}
                            step={500}
                            inputMode="numeric"
                            value={editDraft.price}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, price: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Kategori
                          <select
                            aria-label={`Kategori ${p.name}`}
                            value={editDraft.categoryId}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, categoryId: e.target.value })
                            }
                          >
                            {catalog.categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="menu-row-actions" style={{ alignItems: "flex-end" }}>
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await updateProduct(p.id, {
                                  name: editDraft.name,
                                  basePriceRp: parsePrice(editDraft.price),
                                  categoryId: editDraft.categoryId,
                                });
                                setEditingId(null);
                              }, "Menu diperbarui.")
                            }
                          >
                            <Icon name="check" size={16} />
                            Simpan
                          </button>
                          <button onClick={() => setEditingId(null)}>Batal</button>
                        </div>
                      </div>
                    ) : (
                      <div className="menu-row-main">
                        <div>
                          <div className="menu-row-title">{p.name}</div>
                          <div className="menu-row-meta">
                            {formatRupiah(p.basePriceRp)}
                            {p.variants.length > 0 ? ` · ${p.variants.length} varian` : ""}
                          </div>
                        </div>
                        <div className="menu-row-actions">
                          <button className="small" onClick={() => startEdit(p)}>
                            <Icon name="edit" size={15} />
                            Edit
                          </button>
                          <button
                            className="small"
                            onClick={() => setVariantFor(variantFor === p.id ? null : p.id)}
                            aria-expanded={variantFor === p.id}
                          >
                            Varian
                          </button>
                          <button
                            className="danger small"
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm(`Hapus menu "${p.name}" dari daftar jual?`)) return;
                              void run(() => deactivateProduct(p.id), `Menu "${p.name}" dihapus.`);
                            }}
                          >
                            <Icon name="trash" size={15} />
                            Hapus
                          </button>
                        </div>
                      </div>
                    )}

                    {variantFor === p.id && (
                      <div className="variant-editor">
                        {p.variants.length === 0 && (
                          <p className="muted" style={{ marginBottom: 8 }}>
                            Belum ada varian. Contoh: Regular, Large, Panas, Dingin.
                          </p>
                        )}
                        {p.variants.map((v) => (
                          <div key={v.id} className="variant-row">
                            <input
                              aria-label={`Nama varian ${v.name}`}
                              defaultValue={v.name}
                              onBlur={(e) => {
                                const next = e.target.value.trim();
                                if (next && next !== v.name)
                                  void run(
                                    () => updateVariant(v.id, { name: next }),
                                    "Varian diperbarui.",
                                  );
                              }}
                            />
                            <input
                              aria-label={`Selisih harga ${v.name}`}
                              type="number"
                              inputMode="numeric"
                              defaultValue={v.priceDeltaRp}
                              onBlur={(e) => {
                                const next = Math.trunc(Number(e.target.value) || 0);
                                if (next !== v.priceDeltaRp)
                                  void run(
                                    () => updateVariant(v.id, { priceDeltaRp: next }),
                                    "Varian diperbarui.",
                                  );
                              }}
                            />
                            <span className="variant-price">
                              = {formatRupiah(p.basePriceRp + v.priceDeltaRp)}
                            </span>
                            <button
                              className="danger small"
                              disabled={busy}
                              onClick={() => void run(() => deactivateVariant(v.id), "Varian dihapus.")}
                            >
                              Hapus
                            </button>
                          </div>
                        ))}
                        <div className="variant-row" style={{ marginTop: 8 }}>
                          <input
                            aria-label="Nama varian baru"
                            placeholder="Nama varian (mis. Large)"
                            value={variantName}
                            onChange={(e) => setVariantName(e.target.value.slice(0, 40))}
                          />
                          <input
                            aria-label="Tambahan harga"
                            type="number"
                            inputMode="numeric"
                            placeholder="+Rp"
                            value={variantDelta}
                            onChange={(e) => setVariantDelta(e.target.value)}
                          />
                          <button
                            className="small"
                            disabled={busy || variantName.trim() === ""}
                            onClick={() =>
                              void run(async () => {
                                await createVariant(
                                  p.id,
                                  variantName,
                                  Math.trunc(Number(variantDelta) || 0),
                                );
                                setVariantName("");
                                setVariantDelta("");
                              }, "Varian ditambahkan.")
                            }
                          >
                            <Icon name="plus" size={15} />
                            Varian
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {error && (
        <div className="danger-note" style={{ marginTop: 14 }} role="alert">
          <Icon name="alert" size={17} />
          <span>{error}</span>
        </div>
      )}
      {info && (
        <div className="banner" style={{ marginTop: 14 }} aria-live="polite">
          <Icon name="check" size={17} />
          <span>{info}</span>
        </div>
      )}
    </div>
  );
}
