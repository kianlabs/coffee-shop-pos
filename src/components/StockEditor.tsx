import { useEffect, useMemo, useState } from "react";
import { formatRupiah } from "../domain/money";
import { adjustStock, loadIngredients, recordPurchase, type IngredientRow } from "../data/stock";
import { isNativePlatform } from "../data/db";
import { Icon } from "./Icon";
import {
  COMMON_BASE_UNITS,
  convertQty,
  formatQtyWithUnit,
  getCompatibleUnits,
  isConvertible,
  normalizeUnit,
} from "../domain/units";

function slugId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `ing-${base || "bahan"}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Layar Stok: satu-satunya tempat `recordPurchase` / `adjustStock` dipanggil.
 * Mendukung konversi satuan otomatis (kg <-> g, l <-> ml) saat pembelian / koreksi.
 */
export function StockEditor() {
  const native = isNativePlatform();
  const [rows, setRows] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(native);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Form pembelian
  const [buyId, setBuyId] = useState("");
  const [buyName, setBuyName] = useState("");
  const [buyUnitPreset, setBuyUnitPreset] = useState<string>("g");
  const [buyCustomUnit, setBuyCustomUnit] = useState("");
  const [buyInputUnit, setBuyInputUnit] = useState("g");
  const [buyQty, setBuyQty] = useState(0);
  const [buyCost, setBuyCost] = useState(0);

  // Form koreksi stok
  const [adjId, setAdjId] = useState("");
  const [adjInputUnit, setAdjInputUnit] = useState("");
  const [adjDelta, setAdjDelta] = useState(0);
  const [adjReason, setAdjReason] = useState("");

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setRows(await loadIngredients());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat bahan.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!native) return;
    void reload();
  }, [native]);

  const selected = useMemo(() => rows.find((r) => r.id === buyId) ?? null, [rows, buyId]);
  const selectedAdj = useMemo(() => rows.find((r) => r.id === adjId) ?? null, [rows, adjId]);

  // Satuan dasar efektif untuk form pembelian
  const effectiveBaseUnit = useMemo(() => {
    if (selected) return selected.baseUnit;
    if (buyUnitPreset === "custom") return buyCustomUnit.trim();
    return buyUnitPreset;
  }, [selected, buyUnitPreset, buyCustomUnit]);

  // Pilihan satuan input pembelian
  const purchaseUnitOptions = useMemo(() => {
    const base = effectiveBaseUnit;
    const compatible = getCompatibleUnits(base);
    const set = new Set<string>();
    if (base) set.add(base);
    for (const u of compatible) set.add(u);
    for (const u of COMMON_BASE_UNITS) set.add(u);
    return Array.from(set);
  }, [effectiveBaseUnit]);

  // Pilihan satuan input koreksi
  const adjUnitOptions = useMemo(() => {
    if (!selectedAdj) return [];
    const base = selectedAdj.baseUnit;
    const compatible = getCompatibleUnits(base);
    const set = new Set<string>();
    if (base) set.add(base);
    for (const u of compatible) set.add(u);
    for (const u of COMMON_BASE_UNITS) set.add(u);
    return Array.from(set);
  }, [selectedAdj]);

  function handleSelectBuyIngredient(id: string) {
    setBuyId(id);
    const ing = rows.find((r) => r.id === id);
    if (ing) {
      setBuyInputUnit(ing.baseUnit);
    } else {
      setBuyInputUnit(buyUnitPreset === "custom" ? buyCustomUnit.trim() : buyUnitPreset);
    }
  }

  function handleSelectAdjIngredient(id: string) {
    setAdjId(id);
    const ing = rows.find((r) => r.id === id);
    if (ing) {
      setAdjInputUnit(ing.baseUnit);
    } else {
      setAdjInputUnit("");
    }
  }

  async function handlePurchase() {
    setError(null);
    setInfo(null);
    const name = selected ? selected.name : buyName.trim();
    const baseUnit = effectiveBaseUnit;
    const inputUnit = buyInputUnit.trim() || baseUnit;

    if (!name) {
      setError("Nama bahan wajib diisi.");
      return;
    }
    if (!baseUnit) {
      setError("Satuan dasar bahan wajib diisi.");
      return;
    }
    if (!(buyQty > 0)) {
      setError("Jumlah pembelian harus lebih dari 0.");
      return;
    }
    if (!(buyCost >= 0)) {
      setError("Harga per satuan tidak boleh negatif.");
      return;
    }
    if (!isConvertible(inputUnit, baseUnit)) {
      setError(`Satuan "${inputUnit}" tidak dapat dikonversi ke satuan dasar "${baseUnit}".`);
      return;
    }
    const convertedQty = convertQty(buyQty, inputUnit, baseUnit);
    if (convertedQty === null || !(convertedQty > 0)) {
      setError(`Jumlah pembelian tidak valid setelah konversi ke "${baseUnit}".`);
      return;
    }

    // Hitung harga per satuan dasar (baseUnit)
    // Total belanja = buyQty * buyCost
    // costPerBaseUnit = totalBelanja / convertedQty
    const totalExpenditure = buyQty * buyCost;
    const costPerBaseUnit = Math.round(totalExpenditure / convertedQty);

    setBusy(true);
    try {
      await recordPurchase({
        ingredientId: selected ? selected.id : slugId(name),
        name,
        baseUnit,
        qty: convertedQty,
        costPerUnitRp: costPerBaseUnit,
      });
      setBuyQty(0);
      setBuyCost(0);
      setBuyName("");
      setBuyId("");
      setBuyCustomUnit("");
      await reload();
      const displayMsg =
        normalizeUnit(inputUnit) !== normalizeUnit(baseUnit)
          ? `Pembelian ${name} ${buyQty} ${inputUnit} (${convertedQty} ${baseUnit}) dicatat.`
          : `Pembelian ${name} ${buyQty} ${baseUnit} dicatat.`;
      setInfo(displayMsg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencatat pembelian.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdjust() {
    setError(null);
    setInfo(null);
    if (!adjId || !selectedAdj) {
      setError("Pilih bahan yang mau dikoreksi.");
      return;
    }
    if (adjDelta === 0) {
      setError("Selisih tidak boleh 0.");
      return;
    }
    if (!adjReason.trim()) {
      setError("Alasan koreksi wajib diisi.");
      return;
    }
    const baseUnit = selectedAdj.baseUnit;
    const inputUnit = adjInputUnit.trim() || baseUnit;

    if (!isConvertible(inputUnit, baseUnit)) {
      setError(`Satuan "${inputUnit}" tidak dapat dikonversi ke satuan dasar "${baseUnit}".`);
      return;
    }
    const convertedDelta = convertQty(adjDelta, inputUnit, baseUnit);
    if (convertedDelta === null || convertedDelta === 0) {
      setError(`Selisih tidak boleh nol setelah konversi ke "${baseUnit}".`);
      return;
    }

    setBusy(true);
    try {
      await adjustStock({
        ingredientId: adjId,
        deltaQty: convertedDelta,
        reason: adjReason.trim(),
      });
      setAdjDelta(0);
      setAdjReason("");
      await reload();
      const displayMsg =
        normalizeUnit(inputUnit) !== normalizeUnit(baseUnit)
          ? `Koreksi stok ${selectedAdj.name} ${adjDelta > 0 ? "+" : ""}${adjDelta} ${inputUnit} (${convertedDelta > 0 ? "+" : ""}${convertedDelta} ${baseUnit}) tersimpan.`
          : `Koreksi stok ${selectedAdj.name} ${convertedDelta > 0 ? "+" : ""}${convertedDelta} ${baseUnit} tersimpan.`;
      setInfo(displayMsg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengoreksi stok.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <span className="spinner" />
        Memuat bahan…
      </div>
    );
  }

  if (!native) {
    return (
      <div className="empty-state">
        <Icon name="box" size={32} />
        <h3>Stok hanya tersedia di aplikasi Android</h3>
        <p>
          Pembelian dan koreksi stok disimpan di database SQLite tablet. Di browser (mode
          pratinjau), layar ini tidak bisa dipakai. Buka aplikasi Android untuk mengelola bahan.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="page-desc" style={{ marginBottom: 14 }}>
        Catat pembelian bahan di sini supaya stok dan HPP resep ikut bergerak. Harga per satuan
        terakhir dipakai sebagai HPP.
      </p>

      <div className="split-grid">
        <section className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Bahan &amp; stok</h3>
              <p className="card-sub">{rows.length} bahan terdaftar.</p>
            </div>
          </div>
          {rows.length === 0 ? (
            <div className="empty-state" style={{ minHeight: 140 }}>
              <Icon name="box" size={30} />
              <p>Belum ada bahan. Tambahkan lewat form pembelian di samping.</p>
            </div>
          ) : (
            <div className="stock-list" style={{ border: 0, padding: 0 }}>
              {rows.map((r) => (
                <div className="stock-row" key={r.id}>
                  <span className="stock-name">{r.name}</span>
                  <span
                    className={`stock-qty ${r.stockQty < 0 ? "is-negative" : ""}`}
                    title={r.stockQty < 0 ? "Stok minus — lakukan koreksi" : undefined}
                  >
                    {formatQtyWithUnit(r.stockQty, r.baseUnit)}
                    {r.stockQty < 0 && " ⚠"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="form-card">
          <h3>Catat pembelian</h3>
          <div className="form-grid">
            <label style={{ gridColumn: "1 / -1" }}>
              Bahan
              <select
                aria-label="Pilih bahan"
                value={buyId}
                onChange={(e) => handleSelectBuyIngredient(e.target.value)}
              >
                <option value="">— bahan baru —</option>
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.baseUnit})
                  </option>
                ))}
              </select>
            </label>
            {!selected && (
              <>
                <label>
                  Nama bahan
                  <input
                    aria-label="Nama bahan"
                    placeholder="mis. Biji kopi"
                    value={buyName}
                    onChange={(e) => setBuyName(e.target.value.slice(0, 60))}
                  />
                </label>
                <label>
                  Satuan dasar
                  <select
                    aria-label="Satuan dasar"
                    value={buyUnitPreset}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBuyUnitPreset(val);
                      if (val !== "custom") {
                        setBuyInputUnit(val);
                      }
                    }}
                  >
                    <option value="g">gram (g)</option>
                    <option value="kg">kilogram (kg)</option>
                    <option value="ml">mililiter (ml)</option>
                    <option value="l">liter (l)</option>
                    <option value="pcs">pcs</option>
                    <option value="custom">Lainnya (bebas)…</option>
                  </select>
                </label>
                {buyUnitPreset === "custom" && (
                  <label style={{ gridColumn: "1 / -1" }}>
                    Satuan dasar kustom
                    <input
                      aria-label="Satuan kustom"
                      placeholder="mis. butir / bungkus / ikat"
                      value={buyCustomUnit}
                      onChange={(e) => {
                        const val = e.target.value.slice(0, 20);
                        setBuyCustomUnit(val);
                        setBuyInputUnit(val);
                      }}
                    />
                  </label>
                )}
              </>
            )}
            <label>
              Jumlah pembelian
              <input
                aria-label="Jumlah"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={buyQty || ""}
                onChange={(e) => setBuyQty(Math.max(0, Number(e.target.value) || 0))}
                placeholder="qty"
              />
            </label>
            <label>
              Satuan pembelian
              <select
                aria-label="Satuan pembelian"
                value={buyInputUnit}
                onChange={(e) => setBuyInputUnit(e.target.value)}
              >
                {purchaseUnitOptions.map((u) => (
                  <option key={u} value={u}>
                    {u} {u === effectiveBaseUnit ? "(satuan dasar)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Harga per {buyInputUnit || "satuan"} (Rp)
              <input
                aria-label="Harga per satuan"
                type="number"
                min={0}
                inputMode="numeric"
                value={buyCost || ""}
                onChange={(e) => setBuyCost(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                placeholder="Rp/satuan"
              />
            </label>
            <div style={{ display: "flex", alignItems: "flex-end", gridColumn: "1 / -1" }}>
              <button
                className="primary block"
                disabled={busy}
                onClick={() => void handlePurchase()}
              >
                <Icon name="plus" size={17} />
                Simpan pembelian
              </button>
            </div>
          </div>
          {buyQty > 0 && buyCost > 0 && (
            <div style={{ marginTop: 8 }}>
              <p className="muted">
                Total belanja: {formatRupiah(buyQty * buyCost)}
                {effectiveBaseUnit &&
                  normalizeUnit(buyInputUnit) !== normalizeUnit(effectiveBaseUnit) &&
                  isConvertible(buyInputUnit, effectiveBaseUnit) && (
                    <>
                      {" "}
                      (≈ {convertQty(buyQty, buyInputUnit, effectiveBaseUnit)} {effectiveBaseUnit} @{" "}
                      {formatRupiah(
                        Math.round(
                          (buyQty * buyCost) /
                            (convertQty(buyQty, buyInputUnit, effectiveBaseUnit) || 1),
                        ),
                      )}
                      /{effectiveBaseUnit})
                    </>
                  )}
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="form-card" style={{ marginTop: 14 }}>
        <h3>Koreksi stok</h3>
        <p className="muted" style={{ marginBottom: 10 }}>
          Pakai untuk stok opname, bahan rusak, atau susut. Alasan wajib diisi agar jejaknya jelas.
        </p>
        <div className="form-grid">
          <label>
            Bahan
            <select
              aria-label="Pilih bahan koreksi"
              value={adjId}
              onChange={(e) => handleSelectAdjIngredient(e.target.value)}
            >
              <option value="">— pilih bahan —</option>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.baseUnit})
                </option>
              ))}
            </select>
          </label>
          <label>
            Selisih (+/−)
            <input
              aria-label="Selisih"
              type="number"
              step="any"
              inputMode="decimal"
              value={adjDelta || ""}
              onChange={(e) => setAdjDelta(Number(e.target.value) || 0)}
              placeholder="mis. -250 atau 1.5"
            />
          </label>
          <label>
            Satuan koreksi
            <select
              aria-label="Satuan koreksi"
              value={adjInputUnit}
              disabled={!selectedAdj}
              onChange={(e) => setAdjInputUnit(e.target.value)}
            >
              {adjUnitOptions.map((u) => (
                <option key={u} value={u}>
                  {u} {selectedAdj && u === selectedAdj.baseUnit ? "(satuan dasar)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Alasan
            <input
              aria-label="Alasan"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value.slice(0, 200))}
              placeholder="mis. stok opname / tumpah / kedaluwarsa"
            />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end", gridColumn: "1 / -1" }}>
            <button className="block" disabled={busy} onClick={() => void handleAdjust()}>
              <Icon name="check" size={17} />
              Simpan koreksi
            </button>
          </div>
        </div>
      </section>

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
