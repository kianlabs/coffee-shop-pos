import { useMemo, useState } from "react";
import { formatRupiah } from "../domain/money";
import { paymentLabel } from "../data/receipt";
import { formatPct } from "../domain/hppResolve";
import {
  endOfDay,
  formatRangeLabel,
  paymentBreakdown,
  rangeFor,
  startOfDay,
  summarizeSales,
  topProducts,
  type Preset,
} from "../domain/sales";
import type { Order } from "../domain/orders";

const inputStyle = { minHeight: 44, padding: "8px 10px", fontSize: 15, boxSizing: "border-box" } as const;

const PRESETS: Array<{ value: Exclude<Preset, "custom">; label: string }> = [
  { value: "today", label: "Hari ini" },
  { value: "yesterday", label: "Kemarin" },
  { value: "thisWeek", label: "Minggu ini" },
  { value: "last7", label: "7 hari" },
];

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function SalesReport({ orders }: { orders: Order[] }) {
  const [preset, setPreset] = useState<Preset>("today");
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return toLocalInput(d);
  });
  const [customEnd, setCustomEnd] = useState(() => toLocalInput(new Date()));

  const { start, end } = useMemo(() => {
    if (preset === "custom") {
      const s = new Date(customStart);
      const e = new Date(customEnd);
      if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) {
        return rangeFor("last7");
      }
      if (s > e) return { start: e, end: s };
      return { start: s, end: e };
    }
    return rangeFor(preset);
  }, [preset, customStart, customEnd]);

  const summary = useMemo(() => summarizeSales(orders, start, end), [orders, start, end]);
  const top = useMemo(() => topProducts(orders, start, end, 10), [orders, start, end]);
  const pay = useMemo(() => paymentBreakdown(orders, start, end), [orders, start, end]);

  return (
    <div>
      <h2>Laporan Penjualan</h2>

      <div className="field-row" style={{ marginBottom: 12 }}>
        {PRESETS.map((p) => (
          <button
            key={p.value}
            className={preset === p.value ? "" : "outline"}
            aria-pressed={preset === p.value}
            onClick={() => setPreset(p.value)}
          >
            {p.label}
          </button>
        ))}
        <input
          aria-label="Tanggal mulai"
          type="datetime-local"
          value={customStart}
          onChange={(e) => {
            setCustomStart(e.target.value);
            setPreset("custom");
          }}
          style={inputStyle}
        />
        <input
          aria-label="Tanggal selesai"
          type="datetime-local"
          value={customEnd}
          onChange={(e) => {
            setCustomEnd(e.target.value);
            setPreset("custom");
          }}
          style={inputStyle}
        />
      </div>

      <p className="muted" style={{ marginTop: 0 }}>
        {formatRangeLabel(start, end)} · {summary.orderCount} transaksi
      </p>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Omzet</div>
          <div className="stat-value">{formatRupiah(summary.grandTotalRp)}</div>
          <div className="stat-sub">rata-rata {formatRupiah(summary.averageRp)} / transaksi</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Laba kotor</div>
          <div className="stat-value" style={{ color: summary.grossProfitRp < 0 ? "#b00020" : undefined }}>
            {formatRupiah(summary.grossProfitRp)}
          </div>
          <div className="stat-sub">
            margin {formatPct(summary.profitMarginPct)} dari omzet
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">HPP terjual</div>
          <div className="stat-value">{formatRupiah(summary.totalHppRp)}</div>
          <div className="stat-sub">dari snapshot saat transaksi</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Diskon / pajak / layanan</div>
          <div className="stat-value">{formatRupiah(summary.totalDiscountRp)}</div>
          <div className="stat-sub">
            pajak {formatRupiah(summary.totalTaxRp)} · layanan {formatRupiah(summary.totalServiceRp)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Transaksi void</div>
          <div className="stat-value">{summary.voidedCount}</div>
          <div className="stat-sub">{formatRupiah(summary.voidedTotalRp)} dibatalkan</div>
        </div>
      </div>

      <div className="report-row">
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Produk terlaris</h3>
          {top.length === 0 ? (
            <p className="muted">Belum ada penjualan di rentang ini.</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>Menu</th>
                  <th className="num">Qty</th>
                  <th className="num">Omzet</th>
                  <th className="num">Laba</th>
                </tr>
              </thead>
              <tbody>
                {top.map((t) => (
                  <tr key={t.productId}>
                    <td>{t.productName}</td>
                    <td className="num">{t.qty}</td>
                    <td className="num">{formatRupiah(t.grossRp)}</td>
                    <td className="num">{formatRupiah(t.profitRp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Metode bayar</h3>
          {pay.length === 0 ? (
            <p className="muted">Belum ada penjualan di rentang ini.</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>Metode</th>
                  <th className="num">Transaksi</th>
                  <th className="num">Nominal</th>
                </tr>
              </thead>
              <tbody>
                {pay.map((p) => (
                  <tr key={p.method}>
                    <td>{paymentLabel(p.method as Parameters<typeof paymentLabel>[0])}</td>
                    <td className="num">{p.orderCount}</td>
                    <td className="num">{formatRupiah(p.totalRp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

export { startOfDay, endOfDay };
