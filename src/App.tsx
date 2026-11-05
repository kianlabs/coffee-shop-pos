import { useEffect, useMemo, useRef, useState } from "react";
import { EMPTY_CATALOG, unitPriceFor, type Catalog, type Product, type ProductVariant } from "./domain/catalog";
import { loadCatalog } from "./data/catalogRepo";
import { calcSubtotal, calcTotal, formatRupiah, type Rupiah } from "./domain/money";
import { type Order, type OrderLineInput, type PaymentMethod } from "./domain/orders";
import { downloadTextFile, backupFileName, rememberBackup, repo, type BackupRecord } from "./data/orderRepo";
import { saveBackupFile, shareBackupFile } from "./data/backupFile";
import {
  countPendingOutbox,
  loadSyncMeta,
  loadSyncSettings,
  saveSyncSettings,
  syncNow,
} from "./data/sync";
import { decryptJson, encryptJson, isEncryptedBackup } from "./data/cryptoBackup";
import { activePrinter, connectPrinter, disconnectPrinter, listPrinterDevices, printerStatus, type PrinterDevice, type PrinterStatus } from "./data/printer";
import { renderReceiptText } from "./data/receipt";
import { applyRounding, getSettings, saveSettings, type PosSettings } from "./data/settings";
import { closeShift, openShift, summarizeShift, type Shift } from "./domain/shifts";
import { ProductItem } from "./components/ProductItem";
import { HppEditor } from "./components/HppEditor";
import { StockEditor } from "./components/StockEditor";
import { CatalogEditor } from "./components/CatalogEditor";
import { SalesReport } from "./components/SalesReport";

type CartLine = {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPriceRp: Rupiah;
  qty: number;
};

type View = "kasir" | "riwayat" | "laporan" | "menu" | "hpp" | "stok" | "backup" | "pengaturan";

type Status = {
  kind: "error" | "ok" | "info";
  msg: string;
  scope: "kasir" | "riwayat" | "laporan" | "menu" | "hpp" | "stok" | "backup" | "pengaturan";
};

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback lama dipertahankan untuk lingkungan tanpa crypto.randomUUID.
  return `key-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

const CART_STORAGE_KEY = "pos.cart.v1";
const SHIFT_STORAGE_KEY = "pos.shift.v1";

/** Pulihkan keranjang dari storage; data rusak diabaikan, bukan crash. */
function loadStoredCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((l): l is CartLine => {
      if (!l || typeof l !== "object") return false;
      const o = l as Record<string, unknown>;
      return typeof o.productId === "string" && typeof o.qty === "number" && o.qty > 0;
    });
  } catch {
    return [];
  }
}

function loadStoredShift(): Shift | null {
  try {
    const raw = localStorage.getItem(SHIFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.openedAt !== "string") return null;
    return {
      id: o.id,
      cashierName: typeof o.cashierName === "string" ? o.cashierName : "",
      openedAt: o.openedAt,
      closedAt: typeof o.closedAt === "string" ? o.closedAt : null,
      openCashRp: typeof o.openCashRp === "number" ? o.openCashRp : 0,
    };
  } catch {
    return null;
  }
}

export default function App() {
  const [cart, setCart] = useState<CartLine[]>(() => loadStoredCart());
  const [categoryId, setCategoryId] = useState<string>("");
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG);
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
  // Draft terpisah: mengetik di Pengaturan tidak boleh langsung mengubah total
  // di layar kasir sebelum tombol Simpan ditekan.
  const [settingsDraft, setSettingsDraft] = useState<PosSettings>(() => getSettings());
  const [shift, setShift] = useState<Shift | null>(() => loadStoredShift());
  const [lastShiftSummary, setLastShiftSummary] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<"all" | "completed" | "voided">("all");
  const [pinRequest, setPinRequest] = useState<{ orderId: string; label: string } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinAttempts, setPinAttempts] = useState(0);
  const [printerDevices, setPrinterDevices] = useState<PrinterDevice[]>([]);
  const [printerState, setPrinterState] = useState<PrinterStatus>({ connected: false, address: null, name: null });
  const [printerBusy, setPrinterBusy] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [reportOrders, setReportOrders] = useState<Order[] | null>(null);
  const [catalogVersion, setCatalogVersion] = useState(0);

  const viewRef = useRef<View>(view);
  viewRef.current = view;
  const dbReadyRef = useRef(dbReady);
  dbReadyRef.current = dbReady;

  // Keranjang & shift bertahan saat WebView di-kill / HP kehabisan baterai.
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Storage penuh: keranjang tetap hidup di memori.
    }
  }, [cart]);

  useEffect(() => {
    try {
      if (shift) {
        localStorage.setItem(SHIFT_STORAGE_KEY, JSON.stringify(shift));
      } else {
        localStorage.removeItem(SHIFT_STORAGE_KEY);
      }
    } catch {
      // Idem: kegagalan storage tidak boleh menghentikan kasir.
    }
  }, [shift]);

  // Ringkasan Laporan memakai SELURUH order dari DB (bukan 200 terakhir di
  // state), supaya warung yang transaksinya banyak tetap benar totalnya.
  useEffect(() => {
    if (view !== "laporan") return;
    let cancelled = false;
    (async () => {
      try {
        const all = await repo.loadAll();
        if (!cancelled) setReportOrders(all);
      } catch {
        if (!cancelled) setReportOrders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view]);

  // Satu-satunya effect load: initial (ordersVersion 0) selalu jalan sampai
  // dbReady; reload berikutnya (restore) dijaga dbReady agar tak menembak DB
  // yang belum siap. Checkout/void update state langsung, tanpa bump version.
  useEffect(() => {
    if (!dbReadyRef.current && ordersVersion > 0) {
      return;
    }
    let cancelled = false;
    repo
      .load(200)
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

  // Katalog dibaca dari database (bukan daftar hardcoded), sehingga menu yang
  // diisi pemilik langsung muncul di kasir setelah disimpan.
  useEffect(() => {
    let cancelled = false;
    loadCatalog()
      .then((next) => {
        if (cancelled) return;
        setCatalog(next);
        setCategoryId((prev) =>
          prev && next.categories.some((c) => c.id === prev) ? prev : (next.categories[0]?.id ?? ""),
        );
      })
      .catch(() => {
        // Katalog gagal dimuat: kasir tampil kosong, bukan layar putih.
      });
    return () => {
      cancelled = true;
    };
  }, [catalogVersion]);

  const visibleProducts = useMemo(
    () => catalog.products.filter((p) => p.categoryId === categoryId && p.isActive),
    [catalog.products, categoryId],
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
    () => `${JSON.stringify(cart)}|${discount}|${tax}|${serviceCharge}|${roundingCalc.roundingRp}|${posSettings.roundingStep}|${payMethod}|${payAmount}|${notes.trim()}`,
    [cart, discount, tax, serviceCharge, roundingCalc.roundingRp, posSettings.roundingStep, payMethod, payAmount, notes],
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
      // Reset juga potongan & catatan: kalau tidak, order berikutnya mewarisi
      // diskon/pajak order sebelumnya dan total jadi salah tanpa disadari.
      setDiscount(0);
      setTax(0);
      setNotes("");
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
      // Cetak otomatis setelah commit: struk gagal tidak membatalkan penjualan.
      if (posSettings.autoPrint) {
        const port = activePrinter();
        port
          .print(
            renderReceiptText(order, {
              storeName: posSettings.storeName,
              cashierName: posSettings.cashierName,
            }),
          )
          .catch((err: unknown) => {
            setStatus({
              kind: "error",
              msg: `Order tersimpan, tapi struk gagal dicetak: ${
                err instanceof Error ? err.message : "printer tidak merespons"
              }`,
              scope: "kasir",
            });
          });
      }
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

  async function performVoid(orderId: string, label: string) {
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

  async function handleVoid(orderId: string) {
    const label = orders.find((o) => o.id === orderId)?.receiptNumber ?? orderId;
    // PIN lewat modal, bukan window.prompt: prompt tidak menyamarkan input dan
    // tidak bisa dibatasi percobaannya.
    if (posSettings.requireVoidPin) {
      if (posSettings.voidPin === "") {
        setStatus({
          kind: "error",
          msg: "PIN void aktif tapi belum diisi di Pengaturan.",
          scope: "riwayat",
        });
        return;
      }
      setPinInput("");
      setPinError(null);
      setPinAttempts(0);
      setPinRequest({ orderId, label });
      return;
    }
    await performVoid(orderId, label);
  }

  function confirmVoidPin() {
    if (!pinRequest) return;
    if (pinInput !== posSettings.voidPin) {
      const next = pinAttempts + 1;
      setPinAttempts(next);
      setPinInput("");
      if (next >= 3) {
        setPinRequest(null);
        setStatus({ kind: "error", msg: "PIN salah 3x — void dibatalkan.", scope: "riwayat" });
        return;
      }
      setPinError(`PIN salah. Sisa ${3 - next} percobaan.`);
      return;
    }
    const req = pinRequest;
    setPinRequest(null);
    setPinInput("");
    setPinError(null);
    void performVoid(req.orderId, req.label);
  }

  async function handleScanPrinters() {
    setPrinterBusy(true);
    try {
      const list = await listPrinterDevices();
      setPrinterDevices(list);
      setPrinterState(await printerStatus());
      setStatus({
        kind: list.length > 0 ? "ok" : "info",
        msg:
          list.length > 0
            ? `${list.length} printer Bluetooth ditemukan.`
            : "Belum ada printer yang dipasangkan. Pasangkan dulu lewat Setelan Bluetooth Android.",
        scope: "pengaturan",
      });
    } catch (e) {
      setStatus({
        kind: "error",
        msg: e instanceof Error ? e.message : "Gagal memindai printer.",
        scope: "pengaturan",
      });
    } finally {
      setPrinterBusy(false);
    }
  }

  async function handleConnectPrinter(address: string) {
    setPrinterBusy(true);
    try {
      const st = await connectPrinter(address);
      setPrinterState(st);
      setStatus({
        kind: st.connected ? "ok" : "error",
        msg: st.connected ? `Terhubung ke ${st.name ?? address}.` : "Koneksi printer gagal.",
        scope: "pengaturan",
      });
    } catch (e) {
      setStatus({
        kind: "error",
        msg: e instanceof Error ? e.message : "Gagal menyambung printer.",
        scope: "pengaturan",
      });
    } finally {
      setPrinterBusy(false);
    }
  }

  async function handleDisconnectPrinter() {
    setPrinterBusy(true);
    try {
      await disconnectPrinter();
      setPrinterState({ connected: false, address: null, name: null });
      setStatus({ kind: "ok", msg: "Printer diputuskan.", scope: "pengaturan" });
    } catch (e) {
      setStatus({
        kind: "error",
        msg: e instanceof Error ? e.message : "Gagal memutus printer.",
        scope: "pengaturan",
      });
    } finally {
      setPrinterBusy(false);
    }
  }

  /**
   * Tutup shift memakai SELURUH order, bukan 200 terakhir yang ada di state —
   * kalau tidak, total setoran shift lebih kecil dari uang di laci.
   */
  async function handleCloseShift() {
    if (!shift) {
      return;
    }
    try {
      const all = await repo.loadAll();
      const { shift: closed, summary } = closeShift(shift, all);
      setShift(null);
      setLastShiftSummary(
        `Shift ${closed.cashierName || "(tanpa nama)"} ditutup: ${summary.orderCount} order, total ${formatRupiah(summary.grandTotalRp)}.`,
      );
      setStatus({
        kind: "ok",
        msg: `Shift ditutup: ${summary.orderCount} order, total ${formatRupiah(summary.grandTotalRp)}.`,
        scope: "pengaturan",
      });
    } catch (e) {
      setStatus({
        kind: "error",
        msg: e instanceof Error ? e.message : "Gagal menutup shift.",
        scope: "pengaturan",
      });
    }
  }

  // Cetak lewat SATU jalur saja. Kalau printer native gagal, jangan diam-diam
  // fallback ke iframe — itu bisa menghasilkan dua struk untuk satu transaksi.
  async function handlePrint(order: Order, scope: "kasir" | "riwayat" = "riwayat"): Promise<boolean> {
    const label = order.receiptNumber;
    const receiptOpts = { storeName: posSettings.storeName, cashierName: posSettings.cashierName };
    const port = activePrinter();
    try {
      await port.print(renderReceiptText(order, receiptOpts));
      setStatus({ kind: "ok", msg: `Struk ${label} terkirim ke ${port.name()}.`, scope });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Cetak gagal.";
      setStatus({
        kind: "error",
        msg: `Cetak gagal: ${msg} Order ${label} tetap tersimpan — cetak ulang tidak membuat order baru.`,
        scope,
      });
      return false;
    }
  }

  async function handleReload() {
    try {
      setOrders(await repo.load(200));
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
      // Di Android blob-download tidak menghasilkan file. Pakai plugin native
      // dulu; browser tetap memakai unduhan biasa.
      let savedPath: string | null = null;
      try {
        savedPath = await saveBackupFile(record.name, json);
      } catch {
        savedPath = null;
      }
      if (savedPath) {
        await shareBackupFile(record.name).catch(() => undefined);
      } else {
        downloadTextFile(json, record.name);
      }
      rememberBackup(record);
      setBackups(repo.listBackups());
      setStatus({
        kind: "ok",
        msg: savedPath
          ? `Backup tersimpan di ${savedPath} (${orderCount} order).`
          : `Backup ${record.name} diunduh (${orderCount} order).`,
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
      let savedPath: string | null = null;
      try {
        savedPath = await saveBackupFile(record.name, enc);
      } catch {
        savedPath = null;
      }
      if (savedPath) {
        await shareBackupFile(record.name).catch(() => undefined);
      } else {
        downloadTextFile(enc, record.name);
      }
      rememberBackup(record);
      setBackups(repo.listBackups());
      setStatus({
        kind: "ok",
        msg: savedPath
          ? `Backup terenkripsi tersimpan di ${savedPath}.`
          : `Backup terenkripsi ${record.name} diunduh.`,
        scope: "backup",
      });
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
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">{posSettings.storeName}</h1>
        <span className="muted">Kasir offline</span>
      </header>
      <p className="app-subtitle">Kasir siap · mode offline</p>
      <nav className="nav-tabs">
        <button
          aria-current={view === "kasir" ? "page" : undefined}
          onClick={() => setView("kasir")}
        >
          Kasir
        </button>{" "}
        <button
          aria-current={view === "menu" ? "page" : undefined}
          onClick={() => setView("menu")}
        >
          Menu
        </button>{" "}
        <button
          aria-current={view === "riwayat" ? "page" : undefined}
          onClick={() => setView("riwayat")}
        >
          Riwayat ({orders.length})
        </button>{" "}
        <button
          aria-current={view === "laporan" ? "page" : undefined}
          onClick={() => setView("laporan")}
        >
          Laporan
        </button>{" "}
        <button
          aria-current={view === "hpp" ? "page" : undefined}
          onClick={() => setView("hpp")}
        >
          HPP
        </button>{" "}
        <button
          aria-current={view === "stok" ? "page" : undefined}
          onClick={() => setView("stok")}
        >
          Stok
        </button>{" "}
        <button
          aria-current={view === "backup" ? "page" : undefined}
          onClick={() => setView("backup")}
        >
          Backup
        </button>{" "}
        <button
          aria-current={view === "pengaturan" ? "page" : undefined}
          onClick={() => setView("pengaturan")}
        >
          Pengaturan
        </button>
      </nav>
      {view === "kasir" && (
        <div className="pos-grid">
          <section className="panel">
            <div className="field-row" style={{ marginBottom: 12 }}>
              {catalog.categories.map((c) => (
                <button
                  key={c.id}
                  aria-current={c.id === categoryId ? "true" : undefined}
                  className={c.id === categoryId ? "" : "outline"}
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {catalog.products.length === 0 ? (
              <div className="banner">
                <strong>Menu masih kosong</strong>
                Isi dulu nama menu dan harganya — setelah itu tinggal dipilih saat jualan.
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => setView("menu")}>Buka Menu &amp; Harga</button>
                </div>
              </div>
            ) : (
              <div className="product-grid">
                {visibleProducts.map((p) => (
                  <ProductItem key={p.id} product={p} variants={p.variants} onAdd={addToCart} />
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-title">
              <h2>Keranjang</h2>
              {cart.length > 0 && (
                <button
                  className="secondary"
                  onClick={() => {
                    setCart([]);
                    setStatus({ kind: "info", msg: "Keranjang dikosongkan.", scope: "kasir" });
                  }}
                >
                  Kosongkan
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <p className="muted">Belum ada item. Pilih menu di sebelah kiri.</p>
            ) : (
              cart.map((l) => (
                <div className="cart-line" key={`${l.productId}-${l.variantId ?? "base"}`}>
                  <div>
                    <div className="cart-name">
                      {l.productName}
                      {l.variantName ? ` · ${l.variantName}` : ""}
                    </div>
                    <div className="cart-sub">
                      {formatRupiah(l.unitPriceRp)} × {l.qty} ={" "}
                      <strong>{formatRupiah(l.unitPriceRp * l.qty)}</strong>
                    </div>
                  </div>
                  <div className="qty-group">
                    <button
                      aria-label={`Kurangi 1 ${l.productName}${l.variantName ? ` ${l.variantName}` : ""}`}
                      onClick={() => changeQty(l.productId, l.variantId, -1)}
                    >
                      −
                    </button>
                    <span className="qty-value">{l.qty}</span>
                    <button
                      aria-label={`Tambah 1 ${l.productName}${l.variantName ? ` ${l.variantName}` : ""}`}
                      onClick={() => changeQty(l.productId, l.variantId, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))
            )}

            <div className="divider" />

            <div className="field-row">
              <label style={{ flex: "1 1 120px", margin: 0 }}>
                Diskon (Rp)
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={discount}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
              <label style={{ flex: "1 1 120px", margin: 0 }}>
                Pajak (Rp)
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={tax}
                  onChange={(e) => setTax(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
            </div>

            {(serviceCharge > 0 || roundingCalc.roundingRp !== 0) && (
              <p className="muted" style={{ marginTop: 8 }}>
                {serviceCharge > 0 ? `Layanan ${formatRupiah(serviceCharge)} · ` : ""}
                {roundingCalc.roundingRp !== 0 && cart.length > 0
                  ? `Pembulatan −${formatRupiah(Math.abs(roundingCalc.roundingRp))}`
                  : ""}
              </p>
            )}

            <div className="total-box">
              <span className="total-label">Total</span>
              <span className="total-value">{formatRupiah(total)}</span>
            </div>

            <div className="field-row" style={{ marginTop: 10 }}>
              <select
                aria-label="Metode bayar"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                style={{ flex: "1 1 130px", margin: 0 }}
              >
                <option value="cash">Tunai</option>
                <option value="qris_manual">QRIS manual</option>
                <option value="other">Lainnya</option>
              </select>
              <input
                aria-label="Nominal bayar"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="Bayar (Rp)"
                value={payAmount}
                onChange={(e) => setPayAmount(Math.max(0, Number(e.target.value) || 0))}
                style={{ flex: "1 1 130px", margin: 0 }}
              />
              <button
                className="secondary"
                disabled={cart.length === 0}
                onClick={() => setPayAmount(total)}
              >
                Uang pas
              </button>
            </div>

            <p className="muted" style={{ marginTop: 8 }}>
              Kembalian{" "}
              <strong className="money">{formatRupiah(Math.max(0, payAmount - total))}</strong>
              {payAmount > 0 && payAmount < total && (
                <span style={{ color: "var(--pos-danger)" }}> — kurang {formatRupiah(total - payAmount)}</span>
              )}
            </p>

            <label>
              Catatan
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="opsional" />
            </label>

            {status?.scope === "kasir" && (
              <p
                role={status.kind === "error" ? "alert" : undefined}
                aria-live="polite"
                className={`status-line is-${status.kind}`}
              >
                {status.msg}
              </p>
            )}

            <button
              style={{ width: "100%", marginTop: 10, minHeight: 52, fontSize: "1rem", fontWeight: 700 }}
              disabled={processing || cart.length === 0 || (!dbReady && !browserReady)}
              aria-busy={processing}
              onClick={handleCheckout}
            >
              {processing ? "Memproses…" : `Bayar ${formatRupiah(total)}`}
            </button>

            {receipt && (
              <>
                <h3 style={{ fontSize: "0.9rem", marginTop: 16 }}>Struk terakhir</h3>
                <pre style={{ background: "#f7f3ee", padding: 12, whiteSpace: "pre-wrap", fontSize: 12 }}>
                  {receipt}
                </pre>
              </>
            )}
          </section>
        </div>
      )}

      {view === "riwayat" && (
        <div className="panel">
          <h2>Riwayat Order</h2>
          <button style={{ minHeight: 44, marginBottom: 8 }} onClick={handleReload}>
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
                <button style={{ minHeight: 44 }} onClick={() => void handlePrint(o)}>
                  Cetak / Cetak ulang
                </button>{" "}
                {o.status === "completed" && (
                  <button style={{ minHeight: 44 }} onClick={() => handleVoid(o.id)}>
                    Void
                  </button>
                )}
              </div>
              ))
            );
          })()}
        </div>
      )}

      {view === "laporan" && (
        <div className="panel">
          {reportOrders === null ? (
            <p className="muted">Memuat laporan…</p>
          ) : (
            <SalesReport orders={reportOrders} />
          )}
        </div>
      )}
      {view === "menu" && (
        <div className="panel">
          <CatalogEditor onChanged={() => setCatalogVersion((v) => v + 1)} />
        </div>
      )}
      {view === "hpp" && (
        <div className="panel">
          <HppEditor />
        </div>
      )}
      {view === "stok" && (
        <div className="panel">
          <StockEditor />
        </div>
      )}
      {view === "backup" && (
        <div className="panel">
          <h2>Backup & Restore</h2>
          <button style={{ minHeight: 44 }} onClick={handleBackup}>
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
          <button style={{ minHeight: 44, marginTop: 8 }} onClick={handleBackupEncrypted}>
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
              style={{ minHeight: 44 }}
              onClick={() => {
                saveSyncSettings(syncSettings);
                setStatus({ kind: "ok", msg: "Pengaturan sync disimpan.", scope: "backup" });
              }}
            >
              Simpan pengaturan
            </button>{" "}
            <button style={{ minHeight: 44 }} disabled={syncing} onClick={handleSyncNow}>
              {syncing ? "Sync…" : "Sync sekarang"}
            </button>
          </div>
        </div>
      )}

      {view === "pengaturan" && (
        <div className="panel">
          <h2>Pengaturan</h2>
          <label>
            Nama toko:{" "}
            <input
              value={settingsDraft.storeName}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, storeName: e.target.value })}
              placeholder="KOPI POS"
              maxLength={100}
            />
          </label>
          <div style={{ marginTop: 8 }}>
            <label>
              Nama kasir:{" "}
              <input
                value={settingsDraft.cashierName}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, cashierName: e.target.value })}
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
                value={settingsDraft.serviceChargeRp}
                onChange={(e) =>
                  setSettingsDraft({ ...settingsDraft, serviceChargeRp: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <label>
              Pembulatan:{" "}
              <select
                value={settingsDraft.roundingStep}
                onChange={(e) =>
                  setSettingsDraft({ ...settingsDraft, roundingStep: Number(e.target.value) as PosSettings["roundingStep"] })
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
                checked={settingsDraft.requireVoidPin}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, requireVoidPin: e.target.checked })}
              />{" "}
              Minta PIN saat void
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <label>
              PIN void:{" "}
              <input
                type="password"
                value={settingsDraft.voidPin}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, voidPin: e.target.value.slice(0, 32) })}
                placeholder="isi bila PIN void aktif"
                autoComplete="off"
              />
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <label>
              <input
                type="checkbox"
                checked={settingsDraft.autoPrint}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, autoPrint: e.target.checked })}
              />{" "}
              Cetak struk otomatis setelah bayar
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <label>
              <input
                type="checkbox"
                checked={settingsDraft.blockNegativeStock}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, blockNegativeStock: e.target.checked })}
              />{" "}
              Tolak transaksi bila stok bahan tidak cukup
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              style={{ minHeight: 44 }}
              onClick={() => {
                if (settingsDraft.requireVoidPin && settingsDraft.voidPin.trim() === "") {
                  setStatus({ kind: "error", msg: "PIN void wajib diisi bila PIN void aktif.", scope: "pengaturan" });
                  return;
                }
                const saved = saveSettings(settingsDraft);
                setPosSettings(saved);
                setSettingsDraft(saved);
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
          <h2>Printer</h2>
          <p style={{ fontSize: 13 }}>
            Status:{" "}
            {printerState.connected
              ? `terhubung — ${printerState.name ?? printerState.address ?? ""}`
              : "belum terhubung"}
          </p>
          <button style={{ minHeight: 44 }} disabled={printerBusy} onClick={() => void handleScanPrinters()}>
            {printerBusy ? "Memindai…" : "Cari printer Bluetooth"}
          </button>{" "}
          {printerState.connected && (
            <button style={{ minHeight: 44 }} disabled={printerBusy} onClick={() => void handleDisconnectPrinter()}>
              Putuskan
            </button>
          )}
          {printerDevices.map((d) => (
            <div
              key={d.address}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 6 }}
            >
              <span style={{ fontSize: 13 }}>
                {d.name || "(tanpa nama)"} · {d.address}
              </span>
              <button
                style={{ minHeight: 44 }}
                disabled={printerBusy}
                onClick={() => void handleConnectPrinter(d.address)}
              >
                Hubungkan
              </button>
            </div>
          ))}
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
                style={{ minHeight: 44 }}
                onClick={() => void handleCloseShift()}
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
                style={{ minHeight: 44 }}
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
        </div>
      )}

      {pinRequest && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="PIN void"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div style={{ background: "#fff", padding: 20, borderRadius: 12, width: "100%", maxWidth: 360 }}>
            <h3 style={{ marginTop: 0 }}>PIN void</h3>
            <p style={{ fontSize: 13 }}>Void order {pinRequest.label} butuh PIN.</p>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value.slice(0, 32));
                setPinError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmVoidPin();
              }}
              style={{ width: "100%", minHeight: 48, fontSize: 20, textAlign: "center", boxSizing: "border-box" }}
            />
            {pinError && <p style={{ color: "#b00020", fontSize: 13 }}>{pinError}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                style={{ minHeight: 44, flex: 1 }}
                onClick={() => {
                  setPinRequest(null);
                  setPinInput("");
                  setPinError(null);
                }}
              >
                Batal
              </button>
              <button style={{ minHeight: 44, flex: 1 }} onClick={confirmVoidPin}>
                Lanjut
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
