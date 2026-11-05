import { useEffect, useMemo, useState } from "react";
import { formatRupiah } from "../domain/money";
import { formatPct, marginFor, type HppMode, type VariantHppMode } from "../domain/hppResolve";
import { loadHppProducts, saveHppDrafts, type HppDraft, type HppProductView } from "../data/productRepo";

type Draft = { mode: string; manualRp: number };

const productKey = (id: string) => `p:${id}`;
const variantKey = (id: string) => `v:${id}`;

const PRODUCT_MODES: Array<{ value: HppMode; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "recipe", label: "Resep" },
  { value: "none", label: "Tanpa HPP" },
];

const VARIANT_MODES: Array<{ value: VariantHppMode; label: string }> = [
  { value: "inherit", label: "Ikut produk" },
  { value: "manual", label: "Manual" },
  { value: "recipe", label: "Resep" },
  { value: "none", label: "Tanpa HPP" },
];

function draftHpp(mode: string, manualRp: number, recipePerUnitRp: number | null): number {
  if (mode === "manual") return Math.max(0, Math.trunc(manualRp));
  if (mode === "recipe") {
    if (recipePerUnitRp !== null && recipePerUnitRp > 0) return recipePerUnitRp;
    return Math.max(0, Math.trunc(manualRp));
  }
  return 0;
}

const inputStyle = { minHeight: 44, padding: "8px 10px", fontSize: 15 } as const;

export function HppEditor() {
  const [rows, setRows] = useState<HppProductView[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function applyRows(list: HppProductView[]) {
    setRows(list);
    const next: Record<string, Draft> = {};
    for (const p of list) {
      next[productKey(p.id)] = { mode: p.mode, manualRp: p.manualRp };
      for (const v of p.variants) {
        next[variantKey(v.id)] = { mode: v.mode, manualRp: v.manualRp };
      }
    }
    setDrafts(next);
  }

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      applyRows(await loadHppProducts());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data HPP.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  function patchDraft(key: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { mode: "manual", manualRp: 0 }), ...patch } }));
    setInfo(null);
  }

  const dirty = useMemo<HppDraft[]>(() => {
    const list: HppDraft[] = [];
    for (const p of rows) {
      const d = drafts[productKey(p.id)];
      if (d && (d.mode !== p.mode || d.manualRp !== p.manualRp)) {
        list.push({ kind: "product", id: p.id, mode: d.mode as HppMode, manualRp: d.manualRp });
      }
      for (const v of p.variants) {
        const vd = drafts[variantKey(v.id)];
        if (vd && (vd.mode !== v.mode || vd.manualRp !== v.manualRp)) {
          list.push({ kind: "variant", id: v.id, mode: vd.mode as VariantHppMode, manualRp: vd.manualRp });
        }
      }
    }
    return list;
  }, [rows, drafts]);

  const stats = useMemo(() => {
    let kosong = 0;
    let rugi = 0;
    for (const p of rows) {
      const d = drafts[productKey(p.id)];
      const hpp = d ? draftHpp(d.mode, d.manualRp, p.recipePerUnitRp) : p.resolution.unitHppRp;
      if (hpp <= 0) kosong += 1;
      if (p.basePriceRp - hpp < 0) rugi += 1;
    }
    return { total: rows.length, kosong, rugi };
  }, [rows, drafts]);

  async function handleSave() {
    if (dirty.length === 0) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const count = await saveHppDrafts(dirty);
      await reload();
      setInfo(`${count} perubahan HPP disimpan.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan HPP.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p>Memuat HPP…</p>;
  }

  return (
    <div>
      <h2>HPP &amp; Margin</h2>
      <p style={{ fontSize: 13, color: "#555", marginTop: 0 }}>
        Isi HPP per produk sesuai hitungan Anda (mis. kopi susu 6.000). Pilih <strong>Manual</strong> untuk mengisi
        sendiri, <strong>Resep</strong> untuk dihitung otomatis dari bahan, atau <strong>Tanpa HPP</strong> bila tidak
        dilacak. HPP dikunci saat transaksi, jadi laporan laba lama tidak berubah ketika harga bahan naik.
      </p>

      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          fontSize: 13,
          padding: "10px 12px",
          background: "#f6f6f6",
          borderRadius: 8,
          marginBottom: 12,
        }}
      >
        <span>Produk: <strong>{stats.total}</strong></span>
        <span>Belum ada HPP: <strong>{stats.kosong}</strong></span>
        <span style={{ color: stats.rugi > 0 ? "#b00020" : undefined }}>
          HPP &gt; harga jual: <strong>{stats.rugi}</strong>
        </span>
      </div>

      {rows.length === 0 && <p>Belum ada produk aktif.</p>}

      {rows.map((p) => {
        const d = drafts[productKey(p.id)] ?? { mode: p.mode, manualRp: p.manualRp };
        const hpp = draftHpp(d.mode, d.manualRp, p.recipePerUnitRp);
        const margin = marginFor(p.basePriceRp, hpp);
        const isOpen = expanded[p.id] === true;
        const note =
          d.mode === "recipe" && p.recipePerUnitRp === null
            ? "Resep belum ada — angka manual dipakai sebagai cadangan."
            : d.mode === "manual" && d.manualRp === 0
              ? "HPP masih 0."
              : null;

        return (
          <div
            key={p.id}
            style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 10 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  {p.categoryName} · harga jual {formatRupiah(p.basePriceRp)}
                  {p.recipePerUnitRp !== null ? ` · resep ${formatRupiah(p.recipePerUnitRp)}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  aria-label={`Mode HPP ${p.name}`}
                  value={d.mode}
                  onChange={(e) => patchDraft(productKey(p.id), { mode: e.target.value })}
                  style={inputStyle}
                >
                  {PRODUCT_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`HPP manual ${p.name}`}
                  type="number"
                  min={0}
                  step={100}
                  inputMode="numeric"
                  value={d.manualRp}
                  disabled={d.mode !== "manual"}
                  onChange={(e) =>
                    patchDraft(productKey(p.id), {
                      manualRp: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                    })
                  }
                  style={{ ...inputStyle, width: 130, textAlign: "right" }}
                />
              </div>
            </div>

            <div style={{ marginTop: 8, fontSize: 13 }}>
              HPP dipakai <strong>{formatRupiah(hpp)}</strong> · laba/unit{" "}
              <strong style={{ color: margin.profitRp < 0 ? "#b00020" : undefined }}>
                {formatRupiah(margin.profitRp)}
              </strong>{" "}
              · margin <strong>{formatPct(margin.marginPct)}</strong>
              {note && <span style={{ color: "#a15c00" }}> · {note}</span>}
            </div>

            {p.variants.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <button
                  style={{ minHeight: 40 }}
                  onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !isOpen }))}
                  aria-expanded={isOpen}
                >
                  {isOpen ? "Sembunyikan" : "Atur"} varian ({p.variants.length})
                </button>
                {isOpen && (
                  <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: "3px solid #eee" }}>
                    {p.variants.map((v) => {
                      const vd = drafts[variantKey(v.id)] ?? { mode: v.mode, manualRp: v.manualRp };
                      const vMode: HppMode = vd.mode === "inherit" ? (d.mode as HppMode) : (vd.mode as HppMode);
                      const vManual = vd.mode === "inherit" ? d.manualRp : vd.manualRp;
                      const vHpp = draftHpp(vMode, vManual, v.recipePerUnitRp ?? p.recipePerUnitRp);
                      const vPrice = p.basePriceRp + v.priceDeltaRp;
                      const vMargin = marginFor(vPrice, vHpp);
                      return (
                        <div key={v.id} style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ minWidth: 110, fontWeight: 500 }}>{v.name}</span>
                            <select
                              aria-label={`Mode HPP varian ${p.name} ${v.name}`}
                              value={vd.mode}
                              onChange={(e) => patchDraft(variantKey(v.id), { mode: e.target.value })}
                              style={inputStyle}
                            >
                              {VARIANT_MODES.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </select>
                            <input
                              aria-label={`HPP manual varian ${p.name} ${v.name}`}
                              type="number"
                              min={0}
                              step={100}
                              inputMode="numeric"
                              value={vd.manualRp}
                              disabled={vd.mode !== "manual"}
                              onChange={(e) =>
                                patchDraft(variantKey(v.id), {
                                  manualRp: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                                })
                              }
                              style={{ ...inputStyle, width: 130, textAlign: "right" }}
                            />
                            <span style={{ fontSize: 13 }}>
                              jual {formatRupiah(vPrice)} · HPP {formatRupiah(vHpp)} · margin{" "}
                              {formatPct(vMargin.marginPct)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "#fff",
          borderTop: "1px solid #ddd",
          padding: "10px 0",
          marginTop: 12,
        }}
      >
        <button
          style={{ minHeight: 48, minWidth: 200, fontWeight: 600 }}
          disabled={dirty.length === 0 || saving}
          onClick={() => void handleSave()}
        >
          {saving ? "Menyimpan…" : `Simpan perubahan${dirty.length > 0 ? ` (${dirty.length})` : ""}`}
        </button>
      </div>

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
