import { useMemo, useState } from "react";
import { formatRupiah } from "../domain/money";
import { paymentLabel } from "../data/receipt";
import { formatPct } from "../domain/hppResolve";
import {
  endOfDay,
  formatRangeLabel,
  paymentBreakdown,
  rangeFor,
  salesTrend,
  startOfDay,
  summarizeSales,
  topProducts,
  type Preset,
} from "../domain/sales";
import type { Order } from "../domain/orders";
import { Icon } from "./Icon";
import { SalesTrendChart, TREND_UNIT_LABEL } from "./SalesTrendChart";

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
  const trend = useMemo(() => salesTrend(orders, start, end), [orders, start, end]);
  const payTotal = pay.reduce((sum, p) => sum + p.totalRp, 0);

  return (
    <div>
      <div className="report-toolbar">
        <div className="report-presets" role="group" aria-label="Rentang laporan">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              className={`chip ${preset === p.value ? "is-active" : ""}`}
              aria-pressed={preset === p.value}
              onClick={() => setPreset(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="report-dates">
          <div className="date-field">
            <input
              aria-label="Tanggal mulai"
              type="datetime-local"
              value={customStart}
              onChange={(e) => {
                setCustomStart(e.target.value);
                setPreset("custom");
              }}
            />
          </div>
          <span className="date-sep" aria-hidden="true">
            –
          </span>
          <div className="date-field">
            <input
              aria-label="Tanggal selesai"
              type="datetime-local"
              value={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.value);
                setPreset("custom");
              }}
            />
          </div>
        </div>
      </div>

      <div className="report-range">
        <Icon name="calendar" size={14} />
        <span>{formatRangeLabel(start, end)}</span>
        <span className="report-range-dot" aria-hidden="true" />
        <strong>{summary.orderCount} transaksi</strong>
      </div>

      <div className="stat-grid">
        <div className="stat-card is-primary">
          <div className="stat-top">
            <span className="stat-label">Omzet</span>
            <span className="stat-icon">
              <Icon name="receipt" size={15} />
            </span>
          </div>
          <div className="stat-value">{formatRupiah(summary.grandTotalRp)}</div>
          <div className="stat-sub">rata-rata {formatRupiah(summary.averageRp)} / transaksi</div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Laba kotor</span>
            <span className="stat-icon">
              <Icon name="chart" size={15} />
            </span>
          </div>
          <div
            className="stat-value"
            style={{ color: summary.grossProfitRp < 0 ? "var(--danger)" : undefined }}
          >
            {formatRupiah(summary.grossProfitRp)}
          </div>
          <div className="stat-sub">margin {formatPct(summary.profitMarginPct)} dari omzet</div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">HPP terjual</span>
            <span className="stat-icon">
              <Icon name="calculator" size={15} />
            </span>
          </div>
          <div className="stat-value">{formatRupiah(summary.totalHppRp)}</div>
          <div className="stat-sub">dari snapshot saat transaksi</div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Diskon &amp; biaya</span>
            <span className="stat-icon">
              <Icon name="tag" size={15} />
            </span>
          </div>
          <div className="stat-value">{formatRupiah(summary.totalDiscountRp)}</div>
          <div className="stat-sub">
            pajak {formatRupiah(summary.totalTaxRp)} · layanan{" "}
            {formatRupiah(summary.totalServiceRp)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Transaksi void</span>
            <span className="stat-icon">
              <Icon name="trash" size={15} />
            </span>
          </div>
          <div className="stat-value">{summary.voidedCount}</div>
          <div className="stat-sub">{formatRupiah(summary.voidedTotalRp)} dibatalkan</div>
        </div>
      </div>

      <section className="card report-chart-card">
        <div className="card-head">
          <div>
            <h3 className="card-title">Tren omzet</h3>
            <p className="card-sub">Omzet {TREND_UNIT_LABEL[trend.unit]} · hanya transaksi selesai.</p>
          </div>
          <div className="chart-head-meta">
            {trend.peak && (
              <span className="chart-peak">
                <span>Puncak</span>
                <strong>{formatRupiah(trend.peak.totalRp)}</strong>
                <em>· {trend.peak.label}</em>
              </span>
            )}
            <span className="chart-total">
              <span>Total</span>
              <strong>{formatRupiah(trend.totalRp)}</strong>
            </span>
          </div>
        </div>
        <SalesTrendChart trend={trend} />
      </section>

      <div className="report-row">
        <section className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Produk terlaris</h3>
              <p className="card-sub">10 menu dengan qty terbanyak di rentang ini.</p>
            </div>
          </div>
          {top.length === 0 ? (
            <p className="muted">Belum ada penjualan di rentang ini.</p>
          ) : (
            <div className="table-wrap">
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
                  {top.map((t, i) => (
                    <tr key={t.productId}>
                      <td>
                        <div className="product-cell">
                          <span className={`rank-badge${i < 3 ? " is-top" : ""}`}>{i + 1}</span>
                          <span>{t.productName}</span>
                        </div>
                      </td>
                      <td className="num">{t.qty}</td>
                      <td className="num">{formatRupiah(t.grossRp)}</td>
                      <td className="num">{formatRupiah(t.profitRp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Metode bayar</h3>
              <p className="card-sub">Nominal transaksi bersih, bukan uang diterima.</p>
            </div>
          </div>
          {pay.length === 0 ? (
            <p className="muted">Belum ada penjualan di rentang ini.</p>
          ) : (
            <div className="payment-mix">
              <div className="payment-mix-bar" aria-hidden="true">
                {pay.map((p) => (
                  <span
                    key={p.method}
                    className={`payment-seg is-${p.method}`}
                    style={{ width: `${payTotal > 0 ? (p.totalRp / payTotal) * 100 : 0}%` }}
                  />
                ))}
              </div>
              <ul className="payment-list">
                {pay.map((p) => {
                  const share = payTotal > 0 ? (p.totalRp / payTotal) * 100 : 0;
                  return (
                    <li className="payment-item" key={p.method}>
                      <span className={`payment-dot is-${p.method}`} aria-hidden="true" />
                      <div className="payment-item-main">
                        <div className="payment-item-head">
                          <span className="payment-name">
                            {paymentLabel(p.method as Parameters<typeof paymentLabel>[0])}
                          </span>
                          <strong className="money">{formatRupiah(p.totalRp)}</strong>
                        </div>
                        <div className="payment-item-sub">
                          {p.orderCount} transaksi · {formatPct(share)} dari omzet
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export { startOfDay, endOfDay };
