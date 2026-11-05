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

const inputStyle = { minHeight: 44, padding: "8px 10px", fontSize: 15, boxSizing: "border-box" } as const;

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
    return <p>Memuat menu…</p>;
  }

  return (
    <div>
      <h2>Menu &amp; Harga</h2>
      <p style={{ fontSize: 13, color: "#555", marginTop: 0 }}>
        Daftar menu awalnya kosong. Isi sendiri nama menu dan harganya. Menu yang tidak dijual lagi bisa dihapus
        (riwayat transaksi lama tetap utuh).
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {catalog.categories.map((c) => (
          <span
            key={c.id}
            style={{ padding: "6px 10px", background: "#f1f1f1", borderRadius: 999, fontSize: 13 }}
          >
            {c.name}
          </span>
        ))}
        {showCategoryForm ? (
          <>
            <input
              aria-label="Nama kategori baru"
              placeholder="Nama kategori"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value.slice(0, 60))}
              style={{ ...inputStyle, width: 160 }}
            />
            <button
              style={{ minHeight: 44 }}
              disabled={busy}
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
            <button style={{ minHeight: 44 }} onClick={() => setShowCategoryForm(false)}>
              Batal
            </button>
          </>
        ) : (
          <button style={{ minHeight: 44 }} onClick={() => setShowCategoryForm(true)}>
            + Kategori
          </button>
        )}
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Tambah menu</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            aria-label="Nama menu"
            placeholder="Nama menu (mis. Kopi Susu)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 80) })}
            style={{ ...inputStyle, flex: "1 1 220px" }}
          />
          <input
            aria-label="Harga"
            type="number"
            min={0}
            step={500}
            inputMode="numeric"
            placeholder="Harga (Rp)"
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            style={{ ...inputStyle, width: 140, textAlign: "right" }}
          />
          <select
            aria-label="Kategori"
            value={draft.categoryId}
            onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
            style={inputStyle}
          >
            {catalog.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            style={{ minHeight: 44, minWidth: 140, fontWeight: 600 }}
            disabled={busy || draft.name.trim() === ""}
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
            Tambah menu
          </button>
        </div>
        {draft.price !== "" && (
          <p style={{ fontSize: 13, color: "#555" }}>Harga: {formatRupiah(parsePrice(draft.price))}</p>
        )}
      </div>

      {catalog.products.length === 0 && (
        <div style={{ padding: 16, background: "#fff8e1", borderRadius: 8, fontSize: 14 }}>
          Menu masih kosong. Tambahkan menu pertama di form di atas — setelah itu layar kasir langsung menampilkannya.
        </div>
      )}

      {grouped.map(({ category, products }) =>
        products.length === 0 ? null : (
          <div key={category.id} style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 8 }}>{category.name}</h3>
            {products.map((p) => (
              <div key={p.id} style={{ border: "1px solid #e3e3e3", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                {editingId === p.id ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      aria-label={`Nama ${p.name}`}
                      value={editDraft.name}
                      onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value.slice(0, 80) })}
                      style={{ ...inputStyle, flex: "1 1 200px" }}
                    />
                    <input
                      aria-label={`Harga ${p.name}`}
                      type="number"
                      min={0}
                      step={500}
                      inputMode="numeric"
                      value={editDraft.price}
                      onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })}
                      style={{ ...inputStyle, width: 140, textAlign: "right" }}
                    />
                    <select
                      aria-label={`Kategori ${p.name}`}
                      value={editDraft.categoryId}
                      onChange={(e) => setEditDraft({ ...editDraft, categoryId: e.target.value })}
                      style={inputStyle}
                    >
                      {catalog.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      style={{ minHeight: 44 }}
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
                      Simpan
                    </button>
                    <button style={{ minHeight: 44 }} onClick={() => setEditingId(null)}>
                      Batal
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 13, color: "#666" }}>
                        {formatRupiah(p.basePriceRp)}
                        {p.variants.length > 0
                          ? ` · ${p.variants.length} varian`
                          : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button style={{ minHeight: 44 }} onClick={() => startEdit(p)}>
                        Edit
                      </button>
                      <button style={{ minHeight: 44 }} onClick={() => setVariantFor(variantFor === p.id ? null : p.id)}>
                        Varian
                      </button>
                      <button
                        style={{ minHeight: 44, color: "#b00020" }}
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Hapus menu "${p.name}" dari daftar jual?`)) return;
                          void run(() => deactivateProduct(p.id), `Menu "${p.name}" dihapus.`);
                        }}
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                )}

                {variantFor === p.id && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #ddd" }}>
                    {p.variants.map((v) => (
                      <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <input
                          aria-label={`Nama varian ${v.name}`}
                          defaultValue={v.name}
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (next && next !== v.name) void run(() => updateVariant(v.id, { name: next }), "Varian diperbarui.");
                          }}
                          style={{ ...inputStyle, width: 140 }}
                        />
                        <input
                          aria-label={`Selisih harga ${v.name}`}
                          type="number"
                          inputMode="numeric"
                          defaultValue={v.priceDeltaRp}
                          onBlur={(e) => {
                            const next = Math.trunc(Number(e.target.value) || 0);
                            if (next !== v.priceDeltaRp) void run(() => updateVariant(v.id, { priceDeltaRp: next }), "Varian diperbarui.");
                          }}
                          style={{ ...inputStyle, width: 110, textAlign: "right" }}
                        />
                        <span style={{ fontSize: 13 }}>
                          = {formatRupiah(p.basePriceRp + v.priceDeltaRp)}
                        </span>
                        <button
                          style={{ minHeight: 44 }}
                          disabled={busy}
                          onClick={() => void run(() => deactivateVariant(v.id), "Varian dihapus.")}
                        >
                          Hapus
                        </button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                      <input
                        aria-label="Nama varian baru"
                        placeholder="Nama varian (mis. Large)"
                        value={variantName}
                        onChange={(e) => setVariantName(e.target.value.slice(0, 40))}
                        style={{ ...inputStyle, width: 180 }}
                      />
                      <input
                        aria-label="Tambahan harga"
                        type="number"
                        inputMode="numeric"
                        placeholder="+Rp"
                        value={variantDelta}
                        onChange={(e) => setVariantDelta(e.target.value)}
                        style={{ ...inputStyle, width: 110, textAlign: "right" }}
                      />
                      <button
                        style={{ minHeight: 44 }}
                        disabled={busy || variantName.trim() === ""}
                        onClick={() =>
                          void run(async () => {
                            await createVariant(p.id, variantName, Math.trunc(Number(variantDelta) || 0));
                            setVariantName("");
                            setVariantDelta("");
                          }, "Varian ditambahkan.")
                        }
                      >
                        + Varian
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ),
      )}

      {error && (
        <p role="alert" style={{ color: "#b00020" }}>
          {error}
        </p>
      )}
      {info && (
        <p aria-live="polite" style={{ color: "#1b5e20" }}>
          {info}
        </p>
      )}
    </div>
  );
}
