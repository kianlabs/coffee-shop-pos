import { useEffect, useMemo, useState } from "react";
import { formatRupiah } from "../domain/money";
import { adjustStock, loadIngredients, recordPurchase, type IngredientRow } from "../data/stock";

const inputStyle = { minHeight: 44, padding: "8px 10px", fontSize: 15 } as const;

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
  const [rows, setRows] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(true);
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
    void reload();
  }, []);

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
    return <p>Memuat bahan…</p>;
  }

  return (
    <div>
      <h2>Bahan &amp; Stok</h2>
      <p style={{ fontSize: 13, color: "#555", marginTop: 0 }}>
        Catat pembelian bahan di sini supaya stok dan HPP resep ikut bergerak. Harga per satuan yang terakhir
        dipakai sebagai HPP.
      </p>

      {rows.length === 0 ? (
        <p>Belum ada bahan. Tambahkan lewat form pembelian di bawah.</p>
      ) : (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", fontSize: 14 }}
            >
              <span>{r.name}</span>
              <span style={{ color: r.stockQty < 0 ? "#b00020" : undefined }}>
                {r.stockQty} {r.baseUnit}
              </span>
            </div>
          ))}
        </div>
      )}

      <h3>Catat pembelian</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select
          aria-label="Pilih bahan"
          value={buyId}
          onChange={(e) => setBuyId(e.target.value)}
          style={inputStyle}
        >
          <option value="">— bahan baru —</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.baseUnit})
            </option>
          ))}
        </select>
        {!selected && (
          <>
            <input
              aria-label="Nama bahan"
              placeholder="Nama bahan"
              value={buyName}
              onChange={(e) => setBuyName(e.target.value.slice(0, 60))}
              style={inputStyle}
            />
            <input
              aria-label="Satuan"
              placeholder="gram / ml / pcs"
              value={buyUnit}
              onChange={(e) => setBuyUnit(e.target.value.slice(0, 20))}
              style={{ ...inputStyle, width: 110 }}
            />
          </>
        )}
        <input
          aria-label="Jumlah"
          type="number"
          min={0}
          inputMode="decimal"
          value={buyQty}
          onChange={(e) => setBuyQty(Math.max(0, Number(e.target.value) || 0))}
          placeholder="qty"
          style={{ ...inputStyle, width: 100 }}
        />
        <input
          aria-label="Harga per satuan"
          type="number"
          min={0}
          inputMode="numeric"
          value={buyCost}
          onChange={(e) => setBuyCost(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
          placeholder="Rp/satuan"
          style={{ ...inputStyle, width: 130 }}
        />
        <button style={{ minHeight: 44 }} disabled={busy} onClick={() => void handlePurchase()}>
          Simpan pembelian
        </button>
      </div>
      {buyQty > 0 && buyCost > 0 && (
        <p style={{ fontSize: 13 }}>Total belanja: {formatRupiah(buyQty * buyCost)}</p>
      )}

      <h3>Koreksi stok</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select aria-label="Pilih bahan koreksi" value={adjId} onChange={(e) => setAdjId(e.target.value)} style={inputStyle}>
          <option value="">— pilih bahan —</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Selisih"
          type="number"
          inputMode="decimal"
          value={adjDelta}
          onChange={(e) => setAdjDelta(Number(e.target.value) || 0)}
          placeholder="+/- qty"
          style={{ ...inputStyle, width: 110 }}
        />
        <input
          aria-label="Alasan"
          value={adjReason}
          onChange={(e) => setAdjReason(e.target.value.slice(0, 200))}
          placeholder="alasan (wajib)"
          style={{ ...inputStyle, minWidth: 200 }}
        />
        <button style={{ minHeight: 44 }} disabled={busy} onClick={() => void handleAdjust()}>
          Simpan koreksi
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
