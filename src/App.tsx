import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, PRODUCTS, unitPriceFor, variantsForProduct, type Product, type ProductVariant } from "./domain/catalog";
import { calcSubtotal, calcTotal, formatRupiah, type Rupiah } from "./domain/money";
import { type Order, type OrderLineInput, type PaymentMethod } from "./domain/orders";
import { backupFileName, downloadTextFile, rememberBackup, repo, type BackupRecord } from "./data/orderRepo";
import {
  countPendingOutbox,
  loadSyncMeta,
  loadSyncSettings,
  saveSyncSettings,
  syncNow,
} from "./data/sync";
import { decryptJson, encryptJson, isEncryptedBackup } from "./data/cryptoBackup";
import { activePrinter } from "./data/printer";
import { printReceipt, renderReceiptText } from "./data/receipt";
import { applyRounding, getSettings, saveSettings, type PosSettings } from "./data/settings";
import { closeShift, openShift, summarizeShift, type Shift } from "./domain/shifts";
import { ProductItem } from "./components/ProductItem";

type CartLine = {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPriceRp: Rupiah;
  qty: number;
};

type View = "kasir" | "riwayat" | "backup" | "pengaturan";

type Status = {
  kind: "error" | "ok" | "info";
  msg: string;
  scope: "kasir" | "riwayat" | "backup" | "pengaturan";
};

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback lama dipertahankan untuk lingkungan tanpa crypto.randomUUID.
  return `key-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export default function App() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [categoryId, setCategoryId] = useState<string>(CATEGORIES[0].id);
  const [discount, setDiscount] = useState<number>(0);
  const [tax, setTax] = useState<number>(0);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [notes, setNotes] = useState<string>("");
  const [status, setStatus] = useState<Status | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [view, setView] = useState<View>("kasir");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [ordersVersion, setOrdersVersion] = useState<number>(0);
  const [backups, setBackups] = useState<BackupRecord[]>(() => repo.listBackups());
  const [dbReady, setDbReady] = useState<boolean>(false);
  const [browserReady, setBrowserReady] = useState<boolean>(false);
  // --- Sync (SyncBackupSlice; MINIMAL, tidak menyentuh handler inti) ---
  const [syncSettings, setSyncSettings] = useState(() => loadSyncSettings());
  const [syncMeta, setSyncMeta] = useState(() => loadSyncMeta());
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [backupPass, setBackupPass] = useState<string>("");
  // --- Pengaturan + shift (WorkflowSlice; state tambahan, handler inti tak diubah) ---
  const [posSettings, setPosSettings] = useState<PosSettings>(() => getSettings());
  const [shift, setShift] = useState<Shift | null>(null);
  const [lastShiftSummary, setLastShiftSummary] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<"all" | "completed" | "voided">("all");

  const [orders, setOrders] = useState<Order[]>([]);

  const viewRef = useRef<View>(view);
  viewRef.current = view;
  const dbReadyRef = useRef(dbReady);
  dbReadyRef.current = dbReady;

  // Satu-satunya effect load: initial (ordersVersion 0) selalu jalan sampai
  // dbReady; reload berikutnya (restore) dijaga dbReady agar tak menembak DB
  // yang belum siap. Checkout/void update state langsung, tanpa bump version.
  useEffect(() => {
    if (!dbReadyRef.current && ordersVersion > 0) {
      return;
    }
    let cancelled = false;
    repo
      .load()
      .then((rows) => {
        if (!cancelled) {
          setOrders(rows);
          setDbReady(true);
          setBrowserReady(true);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setStatus({
            kind: "error",
            msg: e instanceof Error ? e.message : "Gagal memuat order.",
            scope: viewRef.current,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ordersVersion]);

  const visibleProducts = useMemo(
    () => PRODUCTS.filter((p) => p.categoryId === categoryId && p.isActive),
    [categoryId],
  );
  const subtotal = calcSubtotal(cart);
  const serviceCharge = Math.max(0, Math.trunc(posSettings.serviceChargeRp) || 0);
  const baseTotal = calcTotal(subtotal, discount, tax) + serviceCharge;
  const roundingCalc = cart.length === 0 ? { rounded: 0, roundingRp: 0 } : applyRounding(baseTotal, posSettings.roundingStep);
  const total = roundingCalc.rounded;
  // Kunci idempotency stabil per komposisi cart: satu key untuk satu
  // (cart, discount, tax, serviceCharge, rounding, payMethod); double-click
  // pakai key yang sama sehingga backend menandai duplikat, bukan order baru.
  const cartHash = useMemo(
    () => `${JSON.stringify(cart)}|${discount}|${tax}|${serviceCharge}|${roundingCalc.roundingRp}|${posSettings.roundingStep}|${payMethod}`,
    [cart, discount, tax, serviceCharge, roundingCalc.roundingRp, posSettings.roundingStep, payMethod],
  );
  const cartKeyRef = useRef<{ hash: string; key: string } | null>(null);

  function addToCart(product: Product, variant: ProductVariant | null) {
    const variantId = variant ? variant.id : null;
    setCart((prev) => {
      const found = prev.find(
        (l) => l.productId === product.id && l.variantId === variantId,
      );
      if (found) {
        return prev.map((l) =>
          l.productId === product.id && l.variantId === variantId
            ? { ...l, qty: l.qty + 1 }
            : l,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          variantId,
          productName: product.name,
          variantName: variant ? variant.name : null,
          unitPriceRp: unitPriceFor(product, variant),
          qty: 1,
        },
      ];
    });
  }

  function changeQty(productId: string, variantId: string | null, delta: number) {
    setCart((prev) =>
      prev
        .map((l) =>
          l.productId === productId && l.variantId === variantId
            ? { ...l, qty: l.qty + delta }
            : l,
        )
        .filter((l) => l.qty > 0),
    );
  }

  async function handleCheckout() {
    if (processing) {
      return;
    }
    setStatus(null);
    if (cart.length === 0) {
      setStatus({ kind: "error", msg: "Keranjang kosong.", scope: "kasir" });
      return;
    }
    if (!dbReady && !browserReady) {
      setStatus({ kind: "error", msg: "Database belum siap.", scope: "kasir" });
      return;
    }
    const lines: OrderLineInput[] = cart.map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      productName: l.productName,
      variantName: l.variantName,
      unitPriceRp: l.unitPriceRp,
      qty: l.qty,
    }));
    if (cartKeyRef.current?.hash !== cartHash) {
      cartKeyRef.current = { hash: cartHash, key: newIdempotencyKey() };
    }
    const key = cartKeyRef.current.key;
    setProcessing(true);
    try {
      const payload = {
        lines,
        discountRp: discount,
        taxRp: tax,
        serviceChargeRp: serviceCharge,
        roundingRp: roundingCalc.roundingRp,
        payment: {
          method: payMethod,
          amountRp: payAmount,
          paidAt: new Date().toISOString(),
        },
        notes: notes.trim() === "" ? null : notes.trim(),
        idempotencyKey: key,
      };
      const { order, duplicate } = await repo.checkout(payload);
      cartKeyRef.current = null;
      setCart([]);
      setPayAmount(0);
      // Prepend optimistik — tanpa bump ordersVersion agar tak double full-scan.
      setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)]);
      setReceipt(renderReceiptText(order, { storeName: posSettings.storeName, cashierName: posSettings.cashierName }));
      setStatus({
        kind: "ok",
        msg: duplicate
          ? `Duplikat dicegah — order ${order.receiptNumber} sudah ada.`
          : `Order ${order.receiptNumber} tersimpan. Kembalian ${formatRupiah(order.changeRp)}.`,
        scope: "kasir",
      });
    } catch (e) {
      setStatus({
        kind: "error",
        msg: e instanceof Error ? e.message : "Checkout gagal.",
        scope: "kasir",
      });
    } finally {
      setProcessing(false);
    }
  }

  async function handleVoid(orderId: string) {
    const label = orders.find((o) => o.id === orderId)?.receiptNumber ?? orderId;
    // Gate PIN void (WorkflowSlice; handler inti repo.void tidak diubah).
    if (posSettings.requireVoidPin) {
      const entered = window.prompt(`Void order ${label} butuh PIN void:`);
      if (entered === null) {
        return;
      }
      if (posSettings.voidPin === "" || entered !== posSettings.voidPin) {
        setStatus({ kind: "error", msg: "PIN void salah — void dibatalkan.", scope: "riwayat" });
        return;
      }
    }
    if (!window.confirm(`Void order ${label}? Tindakan permanen.`)) {
      return;
    }
    try {
      setOrders(await repo.void(orderId));
      setStatus({ kind: "ok", msg: `Order ${label} dibatalkan (void).`, scope: "riwayat" });
    } catch (e) {
      setStatus({
        kind: "error",
        msg: e instanceof Error ? e.message : "Void gagal.",
        scope: "riwayat",
      });
    }
  }

  // Cetak via PrinterPort aktif; gagal (mis. popup diblokir / native belum
  // terpasang) → fallback printReceipt lama. Reprint aman: order sama,
  // tanpa order baru.
  async function handlePrint(order: Order) {
    const label = order.receiptNumber;
    const receiptOpts = { storeName: posSettings.storeName, cashierName: posSettings.cashierName };
    try {
      await activePrinter().print(renderReceiptText(order, receiptOpts));
      setStatus({ kind: "ok", msg: `Struk ${label} dikirim ke printer.`, scope: "riwayat" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Cetak gagal.";
      try {
        printReceipt(order);
        setStatus({
          kind: "info",
          msg: `Printer utama gagal (${msg}) — dipakai cetak browser. Cetak ulang aman, order tetap ${label}.`,
          scope: "riwayat",
        });
      } catch {
        setStatus({
          kind: "error",
          msg: `Cetak gagal: ${msg} Cetak ulang aman — order tetap ${label}, tanpa order baru.`,
          scope: "riwayat",
        });
      }
    }
  }

  async function handleReload() {
    try {
      setOrders(await repo.load());
      setDbReady(true);
      setBrowserReady(true);
    } catch (e) {
      setStatus({
        kind: "error",
        msg: e instanceof Error ? e.message : "Gagal memuat order.",
        scope: "riwayat",
      });
    }
  }

  async function handleBackup() {
    try {
      const json = await repo.exportJson();
      let orderCount = orders.length;
      try {
        const parsed = JSON.parse(json) as { orders?: unknown[] };
        if (Array.isArray(parsed.orders)) {
          orderCount = parsed.orders.length;
        }
      } catch {
        // Pakai hitungan state bila isi JSON tak bisa diurai.
      }
      const record: BackupRecord = {
        name: backupFileName(),
        createdAt: new Date().toISOString(),
        orderCount,
      };
      downloadTextFile(json, record.name);
      rememberBackup(record);
      setBackups(repo.listBackups());
      setStatus({
        kind: "ok",
        msg: `Backup ${record.name} diunduh (${orderCount} order).`,
        scope: "backup",
      });
    } catch (e) {
      setStatus({
        kind: "error",
        msg: e instanceof Error ? e.message : "Backup gagal.",
        scope: "backup",
      });
    }
  }

  function handleRestoreFile(file: File | undefined) {
    setStatus(null);
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = String(reader.result ?? "");
        const current = await repo.load();
        if (
          !window.confirm(
            `Restore akan MENIMPA ${current.length} order yang ada dengan isi file backup. Lanjut?`,
          )
        ) {
          return;
        }
        const count = await repo.importJson(text);
        // Reload lewat version bump (effect) — tanpa setOrders ganda di sini.
        setOrdersVersion((v) => v + 1);
        setBackups(repo.listBackups());
        // Scope riwayat karena view langsung dipindah ke sana.
        setStatus({ kind: "ok", msg: `Restore berhasil — ${count} order dimuat.`, scope: "riwayat" });
        setView("riwayat");
      } catch (e) {
        setStatus({
          kind: "error",
          msg: e instanceof Error ? e.message : "Restore gagal.",
          scope: "backup",
        });
      }
    };
    reader.readAsText(file);
  }
  // --- Sync & backup terenkripsi (SyncBackupSlice; handler inti tak diubah) ---
  async function refreshPending() {
    try {
      setPendingCount(await countPendingOutbox());
    } catch {
      setPendingCount(null);
    }
  }

  async function handleSyncNow() {
    if (syncing) {
      return;
    }
    setSyncing(true);
    try {
      const r = await syncNow(syncSettings);
      setSyncMeta(loadSyncMeta());
      await refreshPending();
      const rej = r.rejected.length > 0 ? `, ${r.rejected.length} ditolak server` : "";
      setStatus({ kind: "ok", msg: `Sync selesai: ${r.acked.length} ter-ack${rej}.`, scope: "backup" });
    } catch (e) {
      setSyncMeta(loadSyncMeta());
      await refreshPending();
      setStatus({ kind: "error", msg: e instanceof Error ? e.message : "Sync gagal.", scope: "backup" });
    } finally {
      setSyncing(false);
    }
  }

  async function handleBackupEncrypted() {
    try {
      if (!backupPass) {
        setStatus({ kind: "error", msg: "Isi passphrase dulu untuk backup terenkripsi.", scope: "backup" });
        return;
      }
      const json = await repo.exportJson();
      const enc = await encryptJson(json, backupPass);
      let orderCount = orders.length;
      try {
        const parsed = JSON.parse(json) as { orders?: unknown[] };
        if (Array.isArray(parsed.orders)) {
          orderCount = parsed.orders.length;
        }
      } catch {
        // Pakai hitungan state.
      }
      const record: BackupRecord = {
        name: backupFileName().replace(/\.json$/, "") + ".enc.json",
        createdAt: new Date().toISOString(),
        orderCount,
      };
      downloadTextFile(enc, record.name);
      rememberBackup(record);
      setBackups(repo.listBackups());
      setStatus({ kind: "ok", msg: `Backup terenkripsi ${record.name} diunduh.`, scope: "backup" });
    } catch (e) {
      setStatus({ kind: "error", msg: e instanceof Error ? e.message : "Backup terenkripsi gagal.", scope: "backup" });
    }
  }

  // Route restore terenkripsi -> decrypt dulu, lalu alur restore yang sama.
  // Dipanggil dari input file; plaintext diteruskan ke handler lama tanpa perubahan.
  function handleRestoreFileSmart(file: File | undefined) {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      if (!isEncryptedBackup(text)) {
        handleRestoreFile(file);
        return;
      }
      const pass = window.prompt("File backup terenkripsi — masukkan passphrase:");
      if (!pass) {
        setStatus({ kind: "error", msg: "Restore dibatalkan: passphrase kosong.", scope: "backup" });
        return;
      }
      decryptJson(text, pass)
        .then((plain) => {
          const blob = new Blob([plain], { type: "application/json" });
          handleRestoreFile(new File([blob], file.name.replace(/\.enc\.json$/, ".json")));
        })
        .catch((e: unknown) => {
          setStatus({
            kind: "error",
            msg: e instanceof Error ? e.message : "Gagal mendekripsi backup.",
            scope: "backup",
          });
        });
    };
    reader.readAsText(file);
  }

  // Pending count awal + auto-sync tiap 60 dtk bila online (cleanup saat unmount).
  useEffect(() => {
    let cancelled = false;
    refreshPending().catch(() => undefined);
    const t = window.setInterval(async () => {
      if (cancelled || document.hidden || !navigator.onLine) {
        return;
      }
      try {
        await syncNow(loadSyncSettings());
        if (!cancelled) {
          setSyncMeta(loadSyncMeta());
          setPendingCount(await countPendingOutbox());
        }
      } catch {
        if (!cancelled) {
          setSyncMeta(loadSyncMeta());
          setPendingCount(await countPendingOutbox().catch(() => null));
        }
      }
    }, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  function statusColor(kind: Status["kind"]): string {
    return kind === "error" ? "red" : kind === "ok" ? "green" : "#333";
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16, fontFamily: "sans-serif" }}>
      <h1>Kopi POS - Kasir</h1>
      <p>Kasir Siap - Offline Mode</p>
      <nav style={{ marginBottom: 16 }}>
        <button
          aria-current={view === "kasir" ? "page" : undefined}
          style={{ minHeight: 40, fontWeight: view === "kasir" ? "bold" : undefined }}
          onClick={() => setView("kasir")}
        >
          Kasir
        </button>{" "}
        <button
          aria-current={view === "riwayat" ? "page" : undefined}
          style={{ minHeight: 40, fontWeight: view === "riwayat" ? "bold" : undefined }}
          onClick={() => setView("riwayat")}
        >
          Riwayat ({orders.length})
        </button>{" "}
        <button
          aria-current={view === "backup" ? "page" : undefined}
          style={{ minHeight: 40, fontWeight: view === "backup" ? "bold" : undefined }}
          onClick={() => setView("backup")}
        >
          Backup
        </button>{" "}
        <button
          aria-current={view === "pengaturan" ? "page" : undefined}
          style={{ minHeight: 40, fontWeight: view === "pengaturan" ? "bold" : undefined }}
          onClick={() => setView("pengaturan")}
        >
          Pengaturan
        </button>
      </nav>
      {view === "kasir" && (
        <>
          <div style={{ marginBottom: 12 }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                aria-current={c.id === categoryId ? "true" : undefined}
                style={{
                  marginRight: 8,
                  minHeight: 40,
                  fontWeight: c.id === categoryId ? "bold" : undefined,
                }}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>

          {visibleProducts.map((p) => (
            <ProductItem
              key={p.id}
              product={p}
              variants={variantsForProduct(p.id)}
              onAdd={addToCart}
            />
          ))}

          <h2>Keranjang</h2>
          {cart.length === 0 ? (
            <p>Keranjang kosong</p>
          ) : (
            cart.map((l) => (
              <div key={`${l.productId}-${l.variantId ?? "base"}`} style={{ marginBottom: 4 }}>
                <span>
                  {l.productName}
                  {l.variantName ? ` (${l.variantName})` : ""} x{l.qty} -{" "}
                  {formatRupiah(l.unitPriceRp * l.qty)}
                </span>{" "}
                <button
                  aria-label={`Tambah 1 ${l.productName}${l.variantName ? ` ${l.variantName}` : ""}`}
                  style={{ minWidth: 40, minHeight: 40 }}
                  onClick={() => changeQty(l.productId, l.variantId, 1)}
                >
                  +
                </button>{" "}
                <button
                  aria-label={`Kurangi 1 ${l.productName}${l.variantName ? ` ${l.variantName}` : ""}`}
                  style={{ minWidth: 40, minHeight: 40 }}
                  onClick={() => changeQty(l.productId, l.variantId, -1)}
                >
                  -
                </button>
              </div>
            ))
          )}

          <p>Subtotal: {formatRupiah(subtotal)}</p>
          <label>
            Diskon (Rp):{" "}
            <input
              type="number"
              min={0}
              value={discount}
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>{" "}
          <label>
            Pajak (Rp):{" "}
            <input
              type="number"
              min={0}
              value={tax}
              onChange={(e) => setTax(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          {serviceCharge > 0 && <p>Layanan: {formatRupiah(serviceCharge)} (masuk total)</p>}
          {roundingCalc.roundingRp !== 0 && cart.length > 0 && (
            <p>
              Pembulatan ({posSettings.roundingStep}): -{formatRupiah(Math.abs(roundingCalc.roundingRp))} (masuk total —
              dibayar {formatRupiah(total)})
            </p>
          )}
          <p>Total: {formatRupiah(total)}</p>

          <label>
            Metode:{" "}
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
            >
              <option value="cash">Tunai</option>
              <option value="qris_manual">QRIS manual</option>
              <option value="other">Lainnya</option>
            </select>
          </label>{" "}
          <label>
            Bayar (Rp):{" "}
            <input
              type="number"
              min={0}
              value={payAmount}
              onChange={(e) => setPayAmount(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <div style={{ marginTop: 8 }}>
            <label>
              Catatan:{" "}
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="opsional"
              />
            </label>
          </div>

          {status?.scope === "kasir" && (
            <p
              role={status.kind === "error" ? "alert" : undefined}
              aria-live="polite"
              style={{ color: statusColor(status.kind) }}
            >
              {status.msg}
            </p>
          )}
          <button
            disabled={processing || cart.length === 0 || (!dbReady && !browserReady)}
            style={{ minHeight: 40 }}
            onClick={handleCheckout}
          >
            {processing ? "Memproses..." : `Bayar ${formatRupiah(total)}`}
          </button>

          {receipt && (
            <>
              <h3>Struk terakhir</h3>
              <pre style={{ background: "#f5f5f5", padding: 12, whiteSpace: "pre-wrap" }}>
                {receipt}
              </pre>
            </>
          )}
        </>
      )}

      {view === "riwayat" && (
        <>
          <h2>Riwayat Order</h2>
          <button style={{ minHeight: 40, marginBottom: 8 }} onClick={handleReload}>
            Muat ulang
          </button>{" "}
          <label>
            Status:{" "}
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value as "all" | "completed" | "voided")}
            >
              <option value="all">Semua</option>
              <option value="completed">Completed</option>
              <option value="voided">Voided</option>
            </select>
          </label>
          {status?.scope === "riwayat" && (
            <p
              role={status.kind === "error" ? "alert" : undefined}
              aria-live="polite"
              style={{ color: statusColor(status.kind) }}
            >
              {status.msg}
            </p>
          )}
          {(() => {
            const visible = historyFilter === "all" ? orders : orders.filter((o) => o.status === historyFilter);
            return visible.length === 0 ? (
              <p>{orders.length === 0 ? "Belum ada order." : "Tidak ada order dengan status ini."}</p>
            ) : (
              visible.map((o) => (
              <div
                key={o.id}
                style={{ border: "1px solid #ddd", padding: 8, marginBottom: 8 }}
              >
                <p>
                  {o.receiptNumber} - {formatRupiah(o.totalRp)} - {o.status}
                  {o.status === "voided" && <strong> VOID</strong>}
                </p>
                <p style={{ fontSize: 12 }}>
                  {new Date(o.createdAt).toLocaleString("id-ID")} -{" "}
                  {o.payment.method === "cash" ? "Tunai" : o.payment.method === "qris_manual" ? "QRIS" : "Lainnya"} - Kembalian{" "}
                  {formatRupiah(o.changeRp)}
                </p>
                {o.lines.map((l, i) => (
                  <p key={i} style={{ fontSize: 13 }}>
                    {l.productName}
                    {l.variantName ? ` (${l.variantName})` : ""} x{l.qty}
                  </p>
                ))}
                <button style={{ minHeight: 40 }} onClick={() => void handlePrint(o)}>
                  Cetak / Cetak ulang
                </button>{" "}
                {o.status === "completed" && (
                  <button style={{ minHeight: 40 }} onClick={() => handleVoid(o.id)}>
                    Void
                  </button>
                )}
              </div>
              ))
            );
          })()}
        </>
      )}

      {view === "backup" && (
        <>
          <h2>Backup & Restore</h2>
          <button style={{ minHeight: 40 }} onClick={handleBackup}>
            Unduh backup (JSON)
          </button>
          <div style={{ marginTop: 12 }}>
            <label>
              Restore dari file:{" "}
              <input
                type="file"
                accept="application/json"
                onChange={(e) => handleRestoreFileSmart(e.target.files?.[0])}
              />
            </label>
          </div>
          {status?.scope === "backup" && (
            <p
              role={status.kind === "error" ? "alert" : undefined}
              aria-live="polite"
              style={{ color: statusColor(status.kind) }}
            >
              {status.msg}
            </p>
          )}
          <h3>Backup terenkripsi</h3>
          <label>
            Passphrase:{" "}
            <input
              type="password"
              value={backupPass}
              onChange={(e) => setBackupPass(e.target.value)}
              placeholder="wajib untuk backup .enc"
              autoComplete="off"
            />
          </label>{" "}
          <button style={{ minHeight: 40, marginTop: 8 }} onClick={handleBackupEncrypted}>
            Unduh backup terenkripsi
          </button>
          <h3>Backup terakhir</h3>
          {backups.length === 0 ? (
             <p>Belum ada backup.</p>
           ) : (
             backups.map((b) => (
               <p key={b.name + b.createdAt} style={{ fontSize: 13 }}>
                 {b.name} - {b.orderCount} order
               </p>
             ))
           )}
          <h3>Sync ke server (opsional)</h3>
          <p style={{ fontSize: 13 }}>
            Pending outbox: {pendingCount === null ? "…" : pendingCount}
            {syncMeta.lastSyncAt
              ? ` — sync terakhir ${new Date(syncMeta.lastSyncAt).toLocaleString("id-ID")}`
              : " — belum pernah sync"}
            {syncMeta.lastPushed > 0 ? ` (${syncMeta.lastPushed} ter-ack)` : ""}
          </p>
          {syncMeta.lastError && (
            <p style={{ fontSize: 13, color: "red" }}>Error terakhir: {syncMeta.lastError}</p>
          )}
          <label>
            Endpoint:{" "}
            <input
              value={syncSettings.endpoint}
              onChange={(e) => setSyncSettings({ ...syncSettings, endpoint: e.target.value })}
              placeholder="https://api.example.invalid"
              style={{ width: "100%", maxWidth: 360 }}
            />
          </label>
          <div style={{ marginTop: 8 }}>
            <label>
              API key:{" "}
              <input
                type="password"
                value={syncSettings.apiKey}
                onChange={(e) => setSyncSettings({ ...syncSettings, apiKey: e.target.value })}
                autoComplete="off"
              />
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              style={{ minHeight: 40 }}
              onClick={() => {
                saveSyncSettings(syncSettings);
                setStatus({ kind: "ok", msg: "Pengaturan sync disimpan.", scope: "backup" });
              }}
            >
              Simpan pengaturan
            </button>{" "}
            <button style={{ minHeight: 40 }} disabled={syncing} onClick={handleSyncNow}>
              {syncing ? "Sync…" : "Sync sekarang"}
            </button>
          </div>
        </>
      )}

      {view === "pengaturan" && (
        <>
          <h2>Pengaturan</h2>
          <label>
            Nama toko:{" "}
            <input
              value={posSettings.storeName}
              onChange={(e) => setPosSettings({ ...posSettings, storeName: e.target.value })}
              placeholder="KOPI POS"
              maxLength={100}
            />
          </label>
          <div style={{ marginTop: 8 }}>
            <label>
              Nama kasir:{" "}
              <input
                value={posSettings.cashierName}
                onChange={(e) => setPosSettings({ ...posSettings, cashierName: e.target.value })}
                placeholder="opsional"
                maxLength={100}
              />
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <label>
              Biaya layanan (Rp):{" "}
              <input
                type="number"
                min={0}
                value={posSettings.serviceChargeRp}
                onChange={(e) =>
                  setPosSettings({ ...posSettings, serviceChargeRp: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <label>
              Pembulatan:{" "}
              <select
                value={posSettings.roundingStep}
                onChange={(e) =>
                  setPosSettings({ ...posSettings, roundingStep: Number(e.target.value) as PosSettings["roundingStep"] })
                }
              >
                <option value={0}>Tanpa pembulatan (DEFAULT)</option>
                <option value={100}>Rp100</option>
                <option value={500}>Rp500</option>
                <option value={1000}>Rp1000</option>
              </select>
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <label>
              <input
                type="checkbox"
                checked={posSettings.requireVoidPin}
                onChange={(e) => setPosSettings({ ...posSettings, requireVoidPin: e.target.checked })}
              />{" "}
              Minta PIN saat void
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <label>
              PIN void:{" "}
              <input
                type="password"
                value={posSettings.voidPin}
                onChange={(e) => setPosSettings({ ...posSettings, voidPin: e.target.value.slice(0, 32) })}
                placeholder="isi bila PIN void aktif"
                autoComplete="off"
              />
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              style={{ minHeight: 40 }}
              onClick={() => {
                if (posSettings.requireVoidPin && posSettings.voidPin.trim() === "") {
                  setStatus({ kind: "error", msg: "PIN void wajib diisi bila PIN void aktif.", scope: "pengaturan" });
                  return;
                }
                setPosSettings(saveSettings(posSettings));
                setStatus({ kind: "ok", msg: "Pengaturan disimpan.", scope: "pengaturan" });
              }}
            >
              Simpan pengaturan
            </button>
          </div>
          {status?.scope === "pengaturan" && (
            <p
              role={status.kind === "error" ? "alert" : undefined}
              aria-live="polite"
              style={{ color: statusColor(status.kind) }}
            >
              {status.msg}
            </p>
          )}
          <h2>Shift</h2>
          {shift ? (
            <>
              <p style={{ fontSize: 13 }}>
                Shift berjalan: {shift.cashierName || "(tanpa nama)"} — buka{" "}
                {new Date(shift.openedAt).toLocaleString("id-ID")}
              </p>
              <p style={{ fontSize: 13 }}>
                Berjalan: {summarizeShift(shift, orders).orderCount} order —{" "}
                {formatRupiah(summarizeShift(shift, orders).grandTotalRp)}
              </p>
              <button
                style={{ minHeight: 40 }}
                onClick={() => {
                  const { shift: closed, summary } = closeShift(shift, orders);
                  setShift(null);
                  setLastShiftSummary(
                    `Shift ${closed.cashierName || "(tanpa nama)"} ditutup: ${summary.orderCount} order, total ${formatRupiah(summary.grandTotalRp)}.`,
                  );
                  setStatus({
                    kind: "ok",
                    msg: `Shift ditutup: ${summary.orderCount} order, total ${formatRupiah(summary.grandTotalRp)}.`,
                    scope: "pengaturan",
                  });
                }}
              >
                Tutup shift
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13 }}>
                Tidak ada shift berjalan. Kasir: {posSettings.cashierName || "(belum diisi)"}
              </p>
              <button
                style={{ minHeight: 40 }}
                onClick={() => {
                  setLastShiftSummary(null);
                  setShift(openShift(posSettings.cashierName));
                  setStatus({ kind: "ok", msg: "Shift dibuka.", scope: "pengaturan" });
                }}
              >
                Buka shift
              </button>
            </>
          )}
          {lastShiftSummary && <p style={{ fontSize: 13 }}>Ringkasan terakhir: {lastShiftSummary}</p>}
        </>
      )}
    </div>
  );
}
