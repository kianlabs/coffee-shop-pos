import { useEffect, useMemo, useState } from "react";
import { formatRupiah } from "../domain/money";
import { formatPct, marginFor, type HppMode, type VariantHppMode } from "../domain/hppResolve";
import { loadHppProducts, saveHppDrafts, type HppDraft, type HppProductView } from "../data/productRepo";
import { isNativePlatform } from "../data/db";
import { Icon } from "./Icon";

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

export function HppEditor() {
  const native = isNativePlatform();
  const [rows, setRows] = useState<HppProductView[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(native);
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
    if (!native) return;
    void reload();
  }, [native]);

  function patchDraft(key: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { mode: "manual", manualRp: 0 }), ...patch },
    }));
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
          list.push({
            kind: "variant",
            id: v.id,
            mode: vd.mode as VariantHppMode,
            manualRp: vd.manualRp,
          });
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
    return (
      <div className="loading-state">
        <span className="spinner" />
        Memuat HPP…
      </div>
    );
  }

  if (!native) {
    return (
      <div className="empty-state">
        <Icon name="calculator" size={32} />
        <h3>HPP hanya tersedia di aplikasi Android</h3>
        <p>
          Layar ini membaca database SQLite tablet. Di browser (mode pratinjau), data HPP tidak
          tersedia. Buka aplikasi Android untuk mengatur HPP dan margin.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="page-desc" style={{ marginBottom: 14 }}>
        Isi HPP per produk sesuai hitungan Anda. Pilih <strong>Manual</strong> untuk mengisi sendiri,{" "}
        <strong>Resep</strong> untuk dihitung otomatis dari bahan, atau <strong>Tanpa HPP</strong>{" "}
        bila tidak dilacak. HPP dikunci saat transaksi, jadi laporan laba lama tidak berubah ketika
        harga bahan naik.
      </p>

      <div className="hpp-stats">
        <span className="badge">Produk: {stats.total}</span>
        <span className={`badge ${stats.kosong > 0 ? "badge-warn" : "badge-success"}`}>
          Belum ada HPP: {stats.kosong}
        </span>
        <span className={`badge ${stats.rugi > 0 ? "badge-danger" : "badge-success"}`}>
          HPP &gt; harga jual: {stats.rugi}
        </span>
      </div>

      {rows.length === 0 && (
        <div className="empty-state">
          <Icon name="calculator" size={32} />
          <h3>Belum ada produk aktif</h3>
          <p>Tambahkan menu terlebih dahulu di layar Menu &amp; Harga.</p>
        </div>
      )}

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
          <div key={p.id} className="hpp-card">
            <div className="hpp-head">
              <div>
                <div className="hpp-name">{p.name}</div>
                <div className="hpp-meta">
                  {p.categoryName} · harga jual {formatRupiah(p.basePriceRp)}
                  {p.recipePerUnitRp !== null
                    ? ` · resep ${formatRupiah(p.recipePerUnitRp)}`
                    : ""}
                </div>
              </div>
              <div className="hpp-controls">
                <select
                  aria-label={`Mode HPP ${p.name}`}
                  value={d.mode}
                  onChange={(e) => patchDraft(productKey(p.id), { mode: e.target.value })}
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
                />
              </div>
            </div>

            <div className="hpp-summary">
              HPP dipakai <strong>{formatRupiah(hpp)}</strong> · laba/unit{" "}
              <strong className={margin.profitRp < 0 ? "is-loss" : ""}>
                {formatRupiah(margin.profitRp)}
              </strong>{" "}
              · margin <strong>{formatPct(margin.marginPct)}</strong>
              {note && <span className="hpp-note"> · {note}</span>}
            </div>

            {p.variants.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <button
                  className="small"
                  onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !isOpen }))}
                  aria-expanded={isOpen}
                >
                  {isOpen ? "Sembunyikan" : "Atur"} varian ({p.variants.length})
                </button>
                {isOpen && (
                  <div className="hpp-variants">
                    {p.variants.map((v) => {
                      const vd = drafts[variantKey(v.id)] ?? { mode: v.mode, manualRp: v.manualRp };
                      const vMode: HppMode =
                        vd.mode === "inherit" ? (d.mode as HppMode) : (vd.mode as HppMode);
                      const vManual = vd.mode === "inherit" ? d.manualRp : vd.manualRp;
                      const vHpp = draftHpp(vMode, vManual, v.recipePerUnitRp ?? p.recipePerUnitRp);
                      const vPrice = p.basePriceRp + v.priceDeltaRp;
                      const vMargin = marginFor(vPrice, vHpp);
                      return (
                        <div key={v.id} className="hpp-variant-row">
                          <span className="hpp-variant-name">{v.name}</span>
                          <select
                            aria-label={`Mode HPP varian ${p.name} ${v.name}`}
                            value={vd.mode}
                            onChange={(e) => patchDraft(variantKey(v.id), { mode: e.target.value })}
                            style={{ width: "auto", minWidth: 130 }}
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
                            style={{ width: 120, textAlign: "right" }}
                          />
                          <span className="hpp-meta">
                            jual {formatRupiah(vPrice)} · HPP {formatRupiah(vHpp)} · margin{" "}
                            {formatPct(vMargin.marginPct)}
                          </span>
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

      <div className="sticky-save">
        <span className="muted">
          {dirty.length > 0
            ? `${dirty.length} perubahan belum disimpan.`
            : "Semua perubahan sudah tersimpan."}
        </span>
        <button
          className="primary"
          disabled={dirty.length === 0 || saving}
          onClick={() => void handleSave()}
        >
          <Icon name="check" size={17} />
          {saving ? "Menyimpan…" : `Simpan perubahan${dirty.length > 0 ? ` (${dirty.length})` : ""}`}
        </button>
      </div>

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
