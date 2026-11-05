import { useEffect, useMemo, useState } from "react";
import { formatRupiah } from "../domain/money";
import { adjustStock, loadIngredients, recordPurchase, type IngredientRow } from "../data/stock";
import { isNativePlatform } from "../data/db";
import { Icon } from "./Icon";

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
 * Tanpa layar ini, tabel ingredients selalu kosong dan pemotongan stok mustahil.
 */
export function StockEditor() {
  const native = isNativePlatform();
  const [rows, setRows] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(native);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [buyId, setBuyId] = useState("");
  const [buyName, setBuyName] = useState("");
  const [buyUnit, setBuyUnit] = useState("gram");
  const [buyQty, setBuyQty] = useState(0);
  const [buyCost, setBuyCost] = useState(0);

  const [adjId, setAdjId] = useState("");
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

  async function handlePurchase() {
    setError(null);
    setInfo(null);
    const name = selected ? selected.name : buyName.trim();
    const unit = selected ? selected.baseUnit : buyUnit.trim();
    if (!name) {
      setError("Nama bahan wajib diisi.");
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
    setBusy(true);
    try {
      await recordPurchase({
        ingredientId: selected ? selected.id : slugId(name),
        name,
        baseUnit: unit || "pcs",
        qty: buyQty,
        costPerUnitRp: Math.trunc(buyCost),
      });
      setBuyQty(0);
      setBuyCost(0);
      setBuyName("");
      setBuyId("");
      await reload();
      setInfo(`Pembelian ${name} ${buyQty} ${unit} dicatat.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencatat pembelian.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdjust() {
    setError(null);
    setInfo(null);
    if (!adjId) {
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
    setBusy(true);
    try {
      await adjustStock({ ingredientId: adjId, deltaQty: adjDelta, reason: adjReason.trim() });
      setAdjDelta(0);
      setAdjReason("");
      await reload();
      setInfo("Koreksi stok tersimpan.");
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
                    {r.stockQty} {r.baseUnit}
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
              <select aria-label="Pilih bahan" value={buyId} onChange={(e) => setBuyId(e.target.value)}>
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
                  Satuan
                  <input
                    aria-label="Satuan"
                    placeholder="gram / ml / pcs"
                    value={buyUnit}
                    onChange={(e) => setBuyUnit(e.target.value.slice(0, 20))}
                  />
                </label>
              </>
            )}
            <label>
              Jumlah
              <input
                aria-label="Jumlah"
                type="number"
                min={0}
                inputMode="decimal"
                value={buyQty}
                onChange={(e) => setBuyQty(Math.max(0, Number(e.target.value) || 0))}
                placeholder="qty"
              />
            </label>
            <label>
              Harga per satuan (Rp)
              <input
                aria-label="Harga per satuan"
                type="number"
                min={0}
                inputMode="numeric"
                value={buyCost}
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
            <p className="muted" style={{ marginTop: 8 }}>
              Total belanja: {formatRupiah(buyQty * buyCost)}
            </p>
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
              onChange={(e) => setAdjId(e.target.value)}
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
              inputMode="decimal"
              value={adjDelta}
              onChange={(e) => setAdjDelta(Number(e.target.value) || 0)}
              placeholder="mis. -250"
            />
          </label>
          <label>
            Alasan
            <input
              aria-label="Alasan"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value.slice(0, 200))}
              placeholder="mis. stok opname / tumpah"
            />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
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
