import { useMemo, useState } from "react";
import { CATEGORIES, PRODUCTS, unitPriceFor, variantsForProduct, type Product, type ProductVariant } from "./domain/catalog";
import { calcSubtotal, calcTotal, formatRupiah, type Rupiah } from "./domain/money";
import { type OrderLineInput, type PaymentMethod } from "./domain/orders";
import { checkoutAtomic, downloadBackup, importBackupJson, listBackups, loadOrders, voidOrder, type BackupRecord } from "./data/orderStore";
import { printReceipt, renderReceiptText } from "./data/receipt";
import { ProductItem } from "./components/ProductItem";

type CartLine = {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPriceRp: Rupiah;
  qty: number;
};

type View = "kasir" | "riwayat" | "backup";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
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
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutInfo, setCheckoutInfo] = useState<string | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [view, setView] = useState<View>("kasir");
  const [ordersVersion, setOrdersVersion] = useState<number>(0);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupRecord[]>(() => listBackups());
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const orders = useMemo(() => loadOrders(), [ordersVersion]);
  const visibleProducts = useMemo(
    () => PRODUCTS.filter((p) => p.categoryId === categoryId && p.isActive),
    [categoryId],
  );

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

  const subtotal = calcSubtotal(cart);
  const total = calcTotal(subtotal, discount, tax);

  function handleCheckout() {
    if (processing) {
      return;
    }
    setCheckoutError(null);
    setCheckoutInfo(null);
    if (cart.length === 0) {
      setCheckoutError("Keranjang kosong.");
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
    const key = newIdempotencyKey();
    setProcessing(true);
    try {
      const { order, duplicate } = checkoutAtomic({
        lines,
        discountRp: discount,
        taxRp: tax,
        payment: {
          method: payMethod,
          amountRp: payAmount,
          paidAt: new Date().toISOString(),
        },
        notes: notes.trim() === "" ? null : notes.trim(),
        idempotencyKey: key,
      });
      setCart([]);
      setPayAmount(0);
      setOrdersVersion((v) => v + 1);
      setReceipt(renderReceiptText(order));
      setCheckoutInfo(
        duplicate
          ? `Duplikat dicegah — order ${order.receiptNumber} sudah ada.`
          : `Order ${order.receiptNumber} tersimpan. Kembalian ${formatRupiah(order.changeRp)}.`,
      );
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : "Checkout gagal.");
    } finally {
      setProcessing(false);
    }
  }

  function handleVoid(orderId: string) {
    voidOrder(orderId);
    setOrdersVersion((v) => v + 1);
  }

  function handleBackup() {
    const record = downloadBackup();
    setBackups([record, ...listBackups()].slice(0, 20));
  }

  function handleRestoreFile(file: File | undefined) {
    setRestoreError(null);
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const { count } = importBackupJson(text);
        setOrdersVersion((v) => v + 1);
        setCheckoutInfo(`Restore berhasil — ${count} order dimuat.`);
        setView("riwayat");
      } catch (e) {
        setRestoreError(e instanceof Error ? e.message : "Restore gagal.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16, fontFamily: "sans-serif" }}>
      <h1>Kopi POS - Kasir</h1>
      <p>Kasir Siap - Offline Mode</p>
      <nav style={{ marginBottom: 16 }}>
        <button disabled={view === "kasir"} onClick={() => setView("kasir")}>
          Kasir
        </button>{" "}
        <button disabled={view === "riwayat"} onClick={() => setView("riwayat")}>
          Riwayat ({orders.length})
        </button>{" "}
        <button disabled={view === "backup"} onClick={() => setView("backup")}>
          Backup
        </button>
      </nav>

      {view === "kasir" && (
        <>
          <div style={{ marginBottom: 12 }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                disabled={c.id === categoryId}
                style={{ marginRight: 8 }}
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
                <button onClick={() => changeQty(l.productId, l.variantId, 1)}>+</button>{" "}
                <button onClick={() => changeQty(l.productId, l.variantId, -1)}>-</button>
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

          {checkoutError && <p style={{ color: "red" }}>{checkoutError}</p>}
          {checkoutInfo && <p style={{ color: "green" }}>{checkoutInfo}</p>}
          <button disabled={processing || cart.length === 0} onClick={handleCheckout}>
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
          {orders.length === 0 ? (
            <p>Belum ada order.</p>
          ) : (
            orders.map((o) => (
              <div
                key={o.id}
                style={{ border: "1px solid #ddd", padding: 8, marginBottom: 8 }}
              >
                <p>
                  {o.receiptNumber} - {formatRupiah(o.totalRp)} - {o.status}
                </p>
                <p style={{ fontSize: 12 }}>
                  {new Date(o.createdAt).toLocaleString("id-ID")} -{" "}
                  {o.payment.method === "cash" ? "Tunai" : "QRIS"} - Kembalian{" "}
                  {formatRupiah(o.changeRp)}
                </p>
                {o.lines.map((l, i) => (
                  <p key={i} style={{ fontSize: 13 }}>
                    {l.productName}
                    {l.variantName ? ` (${l.variantName})` : ""} x{l.qty}
                  </p>
                ))}
                <button onClick={() => printReceipt(o)}>Cetak / Cetak ulang</button>{" "}
                {o.status === "completed" && (
                  <button onClick={() => handleVoid(o.id)}>Void</button>
                )}
              </div>
            ))
          )}
        </>
      )}

      {view === "backup" && (
        <>
          <h2>Backup & Restore</h2>
          <button onClick={handleBackup}>Unduh backup (JSON)</button>
          <div style={{ marginTop: 12 }}>
            <label>
              Restore dari file:{" "}
              <input
                type="file"
                accept="application/json"
                onChange={(e) => handleRestoreFile(e.target.files?.[0])}
              />
            </label>
          </div>
          {restoreError && <p style={{ color: "red" }}>{restoreError}</p>}
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
        </>
      )}
    </div>
  );
}
