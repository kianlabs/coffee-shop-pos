import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  EMPTY_CATALOG,
  unitPriceFor,
  variantsOf,
  type Catalog,
  type Product,
  type ProductVariant,
} from "./domain/catalog";
import { loadCatalog } from "./data/catalogRepo";
import { calcSubtotal, calcTotal, formatRupiah, type Rupiah } from "./domain/money";
import { type Order, type OrderLineInput, type PaymentMethod } from "./domain/orders";
import {
  downloadTextFile,
  backupFileName,
  rememberBackup,
  repo,
  type BackupRecord,
} from "./data/orderRepo";
import { saveBackupFile, shareBackupFile } from "./data/backupFile";
import {
  countPendingOutbox,
  loadSyncMeta,
  loadSyncSettings,
  saveSyncSettings,
  syncNow,
} from "./data/sync";
import { decryptJson, encryptJson, isEncryptedBackup } from "./data/cryptoBackup";
import {
  activePrinter,
  connectPrinter,
  disconnectPrinter,
  listPrinterDevices,
  printerStatus,
  type PrinterDevice,
  type PrinterStatus,
} from "./data/printer";
import { paymentLabel, renderReceiptText } from "./data/receipt";
import {
  applyRounding,
  clearPinLockout,
  getPinLockoutState,
  getSettings,
  hashVoidPin,
  migrateLegacyVoidPin,
  recordPinFailure,
  saveSettings,
  verifyVoidPin,
  type PosSettings,
} from "./data/settings";
import { closeShift, openShift, summarizeShift, type Shift } from "./domain/shifts";
import { ProductItem } from "./components/ProductItem";
import { Icon, type IconName } from "./components/Icon";
import {
  checkForAppUpdate,
  downloadAndApplyUpdate,
  initAppUpdater,
  type AvailableUpdate,
} from "./services/appUpdater.ts";
import { APP_VERSION } from "./version.ts";

// Layar admin jarang dibuka saat jam sibuk — dipisah dari bundle awal supaya
// kasir lebih cepat tampil di tablet.
const CatalogEditor = lazy(() =>
  import("./components/CatalogEditor").then((m) => ({ default: m.CatalogEditor })),
);
const HppEditor = lazy(() =>
  import("./components/HppEditor").then((m) => ({ default: m.HppEditor })),
);
const StockEditor = lazy(() =>
  import("./components/StockEditor").then((m) => ({ default: m.StockEditor })),
);
const SalesReport = lazy(() =>
  import("./components/SalesReport").then((m) => ({ default: m.SalesReport })),
);

type SkeletonKind = "cards" | "list" | "report";

/**
 * Placeholder ringan untuk layar admin yang di-lazy-load. Bentuknya meniru
 * grid kartu supaya transisi ke konten asli tidak "melompat", dan label teks
 * tetap tersedia untuk pembaca layar.
 */
function ViewSkeleton({
  label,
  kind = "cards",
}: {
  label: string;
  kind?: SkeletonKind;
}) {
  const rows = kind === "report" ? 4 : kind === "list" ? 5 : 6;
  return (
    <div className="skeleton-state" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="skeleton-toolbar" aria-hidden="true">
        <span className="skeleton skeleton-line is-title" />
        <span className="skeleton skeleton-pill" />
      </div>
      <div
        className={`skeleton-grid ${kind === "report" ? "is-stats" : ""} ${
          kind === "list" ? "is-list" : ""
        }`}
        aria-hidden="true"
      >
        {Array.from({ length: rows }, (_, index) => (
          <div className={`skeleton-card ${kind === "list" ? "is-row" : ""}`} key={index}>
            <span className="skeleton skeleton-line" style={{ width: index % 2 ? "62%" : "78%" }} />
            <span className="skeleton skeleton-line is-sm" style={{ width: index % 3 ? "40%" : "55%" }} />
            {kind === "list" && (
              <span className="skeleton skeleton-line is-sm" style={{ width: "68%" }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ViewFallback({ view }: { view: View }) {
  if (view === "laporan") return <ViewSkeleton label="Memuat laporan…" kind="report" />;
  if (view === "menu") return <ViewSkeleton label="Memuat menu…" kind="list" />;
  if (view === "hpp") return <ViewSkeleton label="Memuat HPP…" kind="list" />;
  if (view === "stok") return <ViewSkeleton label="Memuat stok…" kind="list" />;
  return <ViewSkeleton label="Memuat layar…" />;
}

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
  scope: View;
};

const NAV_ITEMS: Array<{ view: View; label: string; icon: IconName }> = [
  { view: "kasir", label: "Kasir", icon: "cart" },
  { view: "menu", label: "Menu", icon: "menu" },
  { view: "riwayat", label: "Riwayat", icon: "receipt" },
  { view: "laporan", label: "Laporan", icon: "chart" },
  { view: "hpp", label: "HPP", icon: "calculator" },
  { view: "stok", label: "Stok", icon: "box" },
  { view: "backup", label: "Backup", icon: "cloud" },
  { view: "pengaturan", label: "Setelan", icon: "settings" },
];

const VIEW_TITLES: Record<View, string> = {
  kasir: "Kasir",
  riwayat: "Riwayat Order",
  laporan: "Laporan Penjualan",
  menu: "Menu & Harga",
  hpp: "HPP & Margin",
  stok: "Bahan & Stok",
  backup: "Backup & Sync",
  pengaturan: "Pengaturan",
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
      return (
        typeof o.productId === "string" &&
        o.productId.length > 0 &&
        typeof o.productName === "string" &&
        o.productName.length > 0 &&
        typeof o.unitPriceRp === "number" &&
        Number.isInteger(o.unitPriceRp) &&
        o.unitPriceRp >= 0 &&
        typeof o.qty === "number" &&
        Number.isInteger(o.qty) &&
        o.qty > 0 &&
        (o.variantId === null || typeof o.variantId === "string") &&
        (o.variantName === null || typeof o.variantName === "string")
      );
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

function groupByDate(orders: Order[]): Array<[string, Order[]]> {
  const map = new Map<string, Order[]>();
  for (const order of orders) {
    const key = new Date(order.createdAt).toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const list = map.get(key);
    if (list) list.push(order);
    else map.set(key, [order]);
  }
  return [...map.entries()];
}

function orderItemCount(order: Order): number {
  return order.lines.reduce((sum, line) => sum + line.qty, 0);
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
  const [historyFilter, setHistoryFilter] = useState<"all" | "completed" | "voided" | "refunded">("all");
  const [historyQuery, setHistoryQuery] = useState("");
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [pinRequest, setPinRequest] = useState<{
    action: "void" | "refund";
    orderId: string;
    label: string;
  } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinAttempts, setPinAttempts] = useState(0);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [pinVerifying, setPinVerifying] = useState(false);
  // PIN baru tidak pernah masuk ke PosSettings sebagai plaintext; hanya
  // di-hash saat tombol simpan ditekan.
  const [voidPinDraft, setVoidPinDraft] = useState("");
  const [currentPinDraft, setCurrentPinDraft] = useState("");
  const [openCashDraft, setOpenCashDraft] = useState<number>(0);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [printerDevices, setPrinterDevices] = useState<PrinterDevice[]>([]);
  const [printerState, setPrinterState] = useState<PrinterStatus>({
    connected: false,
    address: null,
    name: null,
  });
  const [printerBusy, setPrinterBusy] = useState(false);
  // --- OTA Live Update State ---
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  // --- UI state khusus tampilan ---
  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [lastReceipt, setLastReceipt] = useState<{ order: Order; text: string } | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [reportOrders, setReportOrders] = useState<Order[] | null>(null);
  const [catalogVersion, setCatalogVersion] = useState(0);

  const deferredSearch = useDeferredValue(search);
  const deferredHistoryQuery = useDeferredValue(historyQuery);

  const viewRef = useRef<View>(view);
  viewRef.current = view;
  const dbReadyRef = useRef(dbReady);
  dbReadyRef.current = dbReady;
  const navListRef = useRef<HTMLDivElement | null>(null);
  const navItemRefs = useRef<Partial<Record<View, HTMLButtonElement | null>>>({});
  const [navEdges, setNavEdges] = useState({ left: false, right: false });

  // Migrasi setelan lama: PIN void plaintext -> hash PBKDF2 (sekali saat buka).
  useEffect(() => {
    let cancelled = false;
    void migrateLegacyVoidPin()
      .then((migrated) => {
        if (cancelled || !migrated) return;
        setPosSettings(migrated);
        // Jangan timpa field lain yang mungkin sudah diedit user.
        setSettingsDraft((draft) => ({
          ...draft,
          voidPinHash: migrated.voidPinHash,
          voidPinSalt: migrated.voidPinSalt,
        }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Inisialisasi OTA Updater & silent check pembaruan di latar belakang
  useEffect(() => {
    void initAppUpdater();
    const timer = setTimeout(() => {
      void checkForAppUpdate().then((res) => {
        if (res.hasUpdate && res.update) {
          setAvailableUpdate(res.update);
        }
      });
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

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

  // Indikator online/offline di topbar (tanpa polling).
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Navigasi bawah HP bisa di-scroll horizontal. Hitung apakah masih ada item
  // tersembunyi di kiri/kanan supaya CSS bisa menampilkan gradient tepi.
  useEffect(() => {
    const list = navListRef.current;
    if (!list) return;
    const update = () => {
      const max = list.scrollWidth - list.clientWidth;
      setNavEdges({
        left: list.scrollLeft > 2,
        right: max > 2 && list.scrollLeft < max - 2,
      });
    };
    update();
    list.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      list.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // Saat pindah layar, bawa item nav yang aktif ke area terlihat — tanpa ini
  // Backup/Setelan tetap tersembunyi di luar layar HP.
  useEffect(() => {
    const item = navItemRefs.current[view];
    if (!item) return;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    item.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [view]);

  // Toast feedback hilang sendiri supaya tidak menutupi layar kasir.
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(
      () => setStatus(null),
      status.kind === "error" ? 8000 : 4200,
    );
    return () => window.clearTimeout(timer);
  }, [status]);

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

  const visibleProducts = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (query) {
      return catalog.products.filter(
        (p) =>
          p.isActive &&
          (p.name.toLowerCase().includes(query) ||
            p.variants.some((v) => v.isActive && v.name.toLowerCase().includes(query))),
      );
    }
    return catalog.products.filter((p) => p.categoryId === categoryId && p.isActive);
  }, [catalog.products, categoryId, deferredSearch]);

  const variantsMap = useMemo(() => {
    const map = new Map<string, ProductVariant[]>();
    for (const p of catalog.products) {
      map.set(p.id, variantsOf(p));
    }
    return map;
  }, [catalog.products]);

  const subtotal = calcSubtotal(cart);
  const serviceCharge = Math.max(0, Math.trunc(posSettings.serviceChargeRp) || 0);
  const baseTotal = calcTotal(subtotal, discount, tax) + serviceCharge;
  const roundingCalc =
    cart.length === 0 ? { rounded: 0, roundingRp: 0 } : applyRounding(baseTotal, posSettings.roundingStep);
  const total = roundingCalc.rounded;
  const itemCount = cart.reduce((sum, line) => sum + line.qty, 0);

  // Nominal bayar otomatis "uang pas" saat keranjang baru / setelah transaksi.
  // Ikut menyesuaikan selama kasir belum mengetik nominal sendiri: nilai lama
  // dianggap otomatis bila masih 0 atau sama dengan total sebelumnya.
  const prevTotalRef = useRef(0);
  useEffect(() => {
    const prevTotal = prevTotalRef.current;
    prevTotalRef.current = total;
    setPayAmount((prev) => (prev === 0 || prev === prevTotal ? total : prev));
  }, [total]);

  // Kunci idempotency stabil per komposisi cart: satu key untuk satu
  // (cart, discount, tax, serviceCharge, rounding, payMethod); double-click
  // pakai key yang sama sehingga backend menandai duplikat, bukan order baru.
  const cartHash = useMemo(
    () =>
      `${JSON.stringify(cart)}|${discount}|${tax}|${serviceCharge}|${roundingCalc.roundingRp}|${posSettings.roundingStep}|${payMethod}|${payAmount}|${notes.trim()}`,
    [
      cart,
      discount,
      tax,
      serviceCharge,
      roundingCalc.roundingRp,
      posSettings.roundingStep,
      payMethod,
      payAmount,
      notes,
    ],
  );
  const cartKeyRef = useRef<{ hash: string; key: string } | null>(null);

  const addToCart = useCallback((product: Product, variant: ProductVariant | null) => {
    const variantId = variant ? variant.id : null;
    setCart((prev) => {
      const found = prev.find((l) => l.productId === product.id && l.variantId === variantId);
      if (found) {
        return prev.map((l) =>
          l.productId === product.id && l.variantId === variantId ? { ...l, qty: l.qty + 1 } : l,
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
  }, []);

  function changeQty(productId: string, variantId: string | null, delta: number) {
    setCart((prev) =>
      prev
        .map((l) =>
          l.productId === productId && l.variantId === variantId ? { ...l, qty: l.qty + delta } : l,
        )
        .filter((l) => l.qty > 0),
    );
  }

  function clearCart() {
    setCart([]);
    setDiscount(0);
    setTax(0);
    setNotes("");
    setPayAmount(0);
    setStatus({ kind: "info", msg: "Keranjang dikosongkan.", scope: "kasir" });
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
    if (payAmount < total) {
      setStatus({
        kind: "error",
        msg: `Nominal bayar kurang ${formatRupiah(total - payAmount)}.`,
        scope: "kasir",
      });
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
      setCartOpen(false);
      // Prepend optimistik — tanpa bump ordersVersion agar tak double full-scan.
      setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)]);
      const receiptText = renderReceiptText(order, {
        storeName: posSettings.storeName,
        cashierName: posSettings.cashierName,
      });
      setLastReceipt({ order, text: receiptText });
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
        const printOpts = {
          logoBase64: posSettings.printLogo ? (posSettings.logoBase64 || "assets/logo.png") : undefined,
        };
        port.print(receiptText, printOpts).catch((err: unknown) => {
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
    setActionBusyId(orderId);
    try {
      setOrders(await repo.void(orderId));
      setStatus({ kind: "ok", msg: `Order ${label} dibatalkan (void).`, scope: "riwayat" });
    } catch (e) {
      setStatus({
        kind: "error",
        msg: e instanceof Error ? e.message : "Void gagal.",
        scope: "riwayat",
      });
    } finally {
      setActionBusyId(null);
    }
  }

  async function performRefund(orderId: string, label: string) {
    if (
      !window.confirm(
        `Refund order ${label}? Stok akan dikembalikan dan order ditandai refunded (permanen).`,
      )
    ) {
      return;
    }
    setActionBusyId(orderId);
    try {
      setOrders(await repo.refund(orderId));
      setStatus({ kind: "ok", msg: `Order ${label} berhasil di-refund.`, scope: "riwayat" });
    } catch (e) {
      setStatus({
        kind: "error",
        msg: e instanceof Error ? e.message : "Refund gagal.",
        scope: "riwayat",
      });
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleVoid(orderId: string) {
    const label = orders.find((o) => o.id === orderId)?.receiptNumber ?? orderId;
    if (posSettings.requireVoidPin) {
      const lockout = getPinLockoutState();
      if (lockout.lockedUntil && Date.now() < lockout.lockedUntil) {
        const remainingSec = Math.ceil((lockout.lockedUntil - Date.now()) / 1000);
        setStatus({
          kind: "error",
          msg: `Akses PIN terkunci karena 3x salah. Tunggu ${remainingSec} detik lagi.`,
          scope: "riwayat",
        });
        return;
      }
      if (posSettings.voidPinHash === "" || posSettings.voidPinSalt === "") {
        setStatus({
          kind: "error",
          msg: "PIN void aktif tapi belum diisi di Pengaturan.",
          scope: "riwayat",
        });
        return;
      }
      setPinInput("");
      setPinError(null);
      setPinAttempts(lockout.attempts);
      setPinRequest({ action: "void", orderId, label });
      return;
    }
    await performVoid(orderId, label);
  }

  async function handleRefund(orderId: string) {
    const label = orders.find((o) => o.id === orderId)?.receiptNumber ?? orderId;
    if (posSettings.requireVoidPin) {
      const lockout = getPinLockoutState();
      if (lockout.lockedUntil && Date.now() < lockout.lockedUntil) {
        const remainingSec = Math.ceil((lockout.lockedUntil - Date.now()) / 1000);
        setStatus({
          kind: "error",
          msg: `Akses PIN terkunci karena 3x salah. Tunggu ${remainingSec} detik lagi.`,
          scope: "riwayat",
        });
        return;
      }
      if (posSettings.voidPinHash === "" || posSettings.voidPinSalt === "") {
        setStatus({
          kind: "error",
          msg: "PIN void aktif tapi belum diisi di Pengaturan.",
          scope: "riwayat",
        });
        return;
      }
      setPinInput("");
      setPinError(null);
      setPinAttempts(lockout.attempts);
      setPinRequest({ action: "refund", orderId, label });
      return;
    }
    await performRefund(orderId, label);
  }

  async function confirmVoidPin() {
    if (!pinRequest || pinVerifying) return;
    const lockout = getPinLockoutState();
    if (lockout.lockedUntil && Date.now() < lockout.lockedUntil) {
      const remainingSec = Math.ceil((lockout.lockedUntil - Date.now()) / 1000);
      setPinError(`Akses terkunci karena 3x salah. Coba lagi dalam ${remainingSec} detik.`);
      return;
    }
    setPinVerifying(true);
    try {
      const ok = await verifyVoidPin(pinInput, posSettings);
      if (!ok) {
        const updated = recordPinFailure();
        setPinInput("");
        setPinAttempts(updated.attempts);
        if (updated.lockedUntil) {
          const actionText = pinRequest.action === "refund" ? "refund" : "void";
          setPinRequest(null);
          setStatus({
            kind: "error",
            msg: `PIN salah 3x — akses ${actionText} dikunci selama 5 menit.`,
            scope: "riwayat",
          });
          return;
        }
        setPinError(`PIN salah (percobaan ${updated.attempts} dari 3).`);
        return;
      }
      clearPinLockout();
      setPinAttempts(0);
      const req = pinRequest;
      setPinRequest(null);
      setPinInput("");
      setPinError(null);
      if (req.action === "refund") {
        await performRefund(req.orderId, req.label);
      } else {
        await performVoid(req.orderId, req.label);
      }
    } catch {
      setPinError("PIN tidak bisa diverifikasi. Coba lagi.");
    } finally {
      setPinVerifying(false);
    }
  }

  function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus({ kind: "error", msg: "File harus berupa gambar (PNG/JPEG).", scope: "pengaturan" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 384;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const b64 = canvas.toDataURL("image/png");
        setSettingsDraft((prev) => ({ ...prev, logoBase64: b64 }));
        setStatus({ kind: "ok", msg: "Logo berhasil dipilih. Klik 'Simpan Pengaturan' untuk menerapkan.", scope: "pengaturan" });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveSettings() {
    if (settingsSaving) return;
    const newPin = voidPinDraft.trim();
    const hasStoredPin = posSettings.voidPinHash !== "" && posSettings.voidPinSalt !== "";

    // Proteksi Otorisasi: verifikasi PIN lama bila mematikan requireVoidPin atau mengganti PIN
    const isSecurityChange = (posSettings.requireVoidPin && !settingsDraft.requireVoidPin) || newPin !== "";
    if (hasStoredPin && isSecurityChange) {
      if (currentPinDraft.trim() === "") {
        setStatus({
          kind: "error",
          msg: "Masukkan PIN saat ini untuk memverifikasi perubahan keamanan.",
          scope: "pengaturan",
        });
        return;
      }
      const isAuth = await verifyVoidPin(currentPinDraft.trim(), posSettings);
      if (!isAuth) {
        setStatus({
          kind: "error",
          msg: "PIN saat ini salah. Perubahan pengaturan keamanan ditolak.",
          scope: "pengaturan",
        });
        return;
      }
    }

    if (newPin !== "" && newPin.length < 4) {
      setStatus({
        kind: "error",
        msg: "PIN void minimal 4 karakter.",
        scope: "pengaturan",
      });
      return;
    }
    if (settingsDraft.requireVoidPin && newPin === "" && !hasStoredPin) {
      setStatus({
        kind: "error",
        msg: "PIN void wajib diisi bila PIN void aktif.",
        scope: "pengaturan",
      });
      return;
    }
    setSettingsSaving(true);
    try {
      let next = settingsDraft;
      if (newPin !== "") {
        const { hash, salt } = await hashVoidPin(newPin);
        next = { ...settingsDraft, voidPinHash: hash, voidPinSalt: salt };
      }
      const saved = saveSettings(next);
      setPosSettings(saved);
      setSettingsDraft(saved);
      setVoidPinDraft("");
      setCurrentPinDraft("");
      setStatus({ kind: "ok", msg: "Pengaturan disimpan.", scope: "pengaturan" });
    } catch (e) {
      setStatus({
        kind: "error",
        msg: e instanceof Error ? e.message : "Gagal menyimpan PIN void.",
        scope: "pengaturan",
      });
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleCheckUpdateManual() {
    setUpdateChecking(true);
    setUpdateStatusMsg("Menghubungkan ke GitHub Releases…");
    try {
      const res = await checkForAppUpdate();
      if (res.hasUpdate && res.update) {
        setAvailableUpdate(res.update);
        setShowUpdateModal(true);
        setUpdateStatusMsg(null);
      } else {
        setAvailableUpdate(null);
        setUpdateStatusMsg(res.message || "Aplikasi sudah versi terbaru.");
      }
    } catch (e) {
      setUpdateStatusMsg(e instanceof Error ? e.message : "Gagal memeriksa pembaruan.");
    } finally {
      setUpdateChecking(false);
    }
  }

  async function handleApplyUpdate(update: AvailableUpdate) {
    setUpdateProgress(0);
    try {
      await downloadAndApplyUpdate(update, (pct) => {
        setUpdateProgress(pct);
      });
    } catch (e) {
      setUpdateProgress(null);
      alert(e instanceof Error ? e.message : "Gagal memasang pembaruan.");
    }
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
        `Shift ${closed.cashierName || "(tanpa nama)"} ditutup: ${summary.orderCount} order, omzet ${formatRupiah(summary.grandTotalRp)}${shift.openCashRp > 0 ? ` (modal awal ${formatRupiah(shift.openCashRp)})` : ""}.`,
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
  async function handlePrint(
    order: Order,
    scope: "kasir" | "riwayat" = "riwayat",
  ): Promise<boolean> {
    if (actionBusyId === order.id) return false;
    setActionBusyId(order.id);
    const label = order.receiptNumber;
    const receiptOpts = {
      storeName: posSettings.storeName,
      cashierName: posSettings.cashierName,
    };
    const port = activePrinter();
    const printOpts = {
      logoBase64: posSettings.printLogo ? (posSettings.logoBase64 || "assets/logo.png") : undefined,
    };
    try {
      await port.print(renderReceiptText(order, receiptOpts), printOpts);
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
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleReload() {
    try {
      setOrders(await repo.load(200));
      setDbReady(true);
      setBrowserReady(true);
      setStatus({ kind: "ok", msg: "Riwayat dimuat ulang.", scope: "riwayat" });
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
        setStatus({
          kind: "error",
          msg: "Isi passphrase dulu untuk backup terenkripsi.",
          scope: "backup",
        });
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
      setStatus({
        kind: "error",
        msg: e instanceof Error ? e.message : "Backup terenkripsi gagal.",
        scope: "backup",
      });
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

  const quickCash = useMemo(() => {
    if (total <= 0) return [];
    const values = new Set<number>([total]);
    for (const step of [5000, 10000, 50000]) {
      const rounded = Math.ceil(total / step) * step;
      if (rounded > total) values.add(rounded);
    }
    return [...values].slice(0, 4);
  }, [total]);

  const filteredOrders = useMemo(() => {
    const query = deferredHistoryQuery.trim().toLowerCase();
    return orders.filter((order) => {
      if (historyFilter !== "all" && order.status !== historyFilter) return false;
      if (!query) return true;
      return (
        order.receiptNumber.toLowerCase().includes(query) ||
        order.lines.some((line) => line.productName.toLowerCase().includes(query))
      );
    });
  }, [orders, historyFilter, deferredHistoryQuery]);

  const groupedOrders = useMemo(() => groupByDate(filteredOrders), [filteredOrders]);

  const isShiftTruncated = useMemo(() => {
    if (!shift || orders.length < 200) return false;
    const oldestInState = orders[orders.length - 1];
    return Boolean(oldestInState && oldestInState.createdAt > shift.openedAt);
  }, [shift, orders]);

  const shiftSummary = useMemo(() => (shift ? summarizeShift(shift, orders) : null), [shift, orders]);

  const todayLabel = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  function toggleOrderDetail(orderId: string) {
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  }

  function statusBadgeClass(order: Order): string {
    if (order.status === "voided") return "badge badge-danger";
    if (order.status === "refunded") return "badge badge-warn";
    return "badge badge-success";
  }

  return (
    <div className="app-shell">
      <nav
        className={`nav-rail ${navEdges.left ? "has-more-left" : ""} ${
          navEdges.right ? "has-more-right" : ""
        }`}
        aria-label="Navigasi utama"
      >
        <div className="brand">
          <div className="brand-mark">
            <Icon name="coffee" size={25} />
          </div>
          <img
            className="brand-wordmark"
            src="/assets/brand-wordmark.png"
            alt="Kopi POS"
            width={70}
            height={18}
          />
        </div>
        <div className="nav-list" ref={navListRef}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.view}
              ref={(el) => {
                navItemRefs.current[item.view] = el;
              }}
              className="nav-item"
              aria-current={view === item.view ? "page" : undefined}
              onClick={() => {
                setView(item.view);
                setCartOpen(false);
              }}
            >
              <Icon name={item.icon} />
              <span className="nav-label">{item.label}</span>
              {item.view === "riwayat" && orders.length > 0 && (
                <span className="nav-badge">{orders.length > 99 ? "99+" : orders.length}</span>
              )}
              {item.view === "backup" && pendingCount !== null && pendingCount > 0 && (
                <span className="nav-badge">{pendingCount > 99 ? "99+" : pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <main className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="topbar-title">{VIEW_TITLES[view]}</h1>
            <p className="topbar-sub">
              {posSettings.storeName || "Kopi POS"} · {todayLabel}
            </p>
          </div>
          <div className="topbar-right">
            {availableUpdate && (
              <button
                type="button"
                className="ota-update-pill"
                onClick={() => setShowUpdateModal(true)}
                title="Pembaruan tersedia di GitHub Releases"
              >
                <Icon name="cloud" size={14} />
                <span>Update v{availableUpdate.version}</span>
              </button>
            )}
            <span className={`status-chip ${online ? "is-ok" : "is-warn"}`}>
              <Icon name={online ? "wifi" : "wifiOff"} />
              {online ? "Online" : "Offline"}
            </span>
            <span className={`status-chip is-optional ${shift ? "is-ok" : ""}`}>
              <Icon name="clock" />
              {shift ? "Shift buka" : "Shift tutup"}
            </span>
            {pendingCount !== null && pendingCount > 0 && (
              <span className="status-chip is-warn is-optional">
                <Icon name="sync" />
                {pendingCount} pending
              </span>
            )}
            <span
              className={`status-chip is-optional ${printerState.connected ? "is-ok" : ""}`}
              title={printerState.connected ? printerState.name ?? "Printer terhubung" : "Printer belum terhubung"}
            >
              <Icon name="printer" />
              {printerState.connected ? "Printer" : "No printer"}
            </span>
          </div>
        </header>

        <div className="content">
          <Suspense fallback={<ViewFallback view={view} />}>
          {view === "kasir" && (
            <div className="pos-layout">
              <section className="catalog-panel" aria-label="Daftar menu">
                <div className="catalog-toolbar">
                  <div className="catalog-topline">
                    <div className="search-box">
                      <Icon name="search" />
                      <input
                        aria-label="Cari menu"
                        placeholder="Cari menu…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      {search !== "" && (
                        <button
                          className="search-clear"
                          aria-label="Hapus pencarian"
                          onClick={() => setSearch("")}
                        >
                          <Icon name="close" size={16} />
                        </button>
                      )}
                    </div>
                    <span className="muted" style={{ whiteSpace: "nowrap" }}>
                      {visibleProducts.length} menu
                    </span>
                  </div>

                  {search.trim() === "" && catalog.categories.length > 0 && (
                    <div className="chip-row" role="group" aria-label="Kategori menu">
                      {catalog.categories.map((category) => (
                        <button
                          key={category.id}
                          className={`chip ${category.id === categoryId ? "is-active" : ""}`}
                          aria-pressed={category.id === categoryId}
                          onClick={() => setCategoryId(category.id)}
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {catalog.products.length === 0 ? (
                  <div className="empty-state">
                    <Icon name="menu" size={34} />
                    <h3>Menu masih kosong</h3>
                    <p>Isi nama menu dan harganya dulu — setelah itu tinggal dipilih saat jualan.</p>
                    <button className="primary" onClick={() => setView("menu")}>
                      <Icon name="plus" size={17} />
                      Buka Menu &amp; Harga
                    </button>
                  </div>
                ) : visibleProducts.length === 0 ? (
                  <div className="empty-state">
                    <Icon name="search" size={32} />
                    <h3>Menu tidak ditemukan</h3>
                    <p>Coba kata kunci lain, atau pilih kategori yang berbeda.</p>
                    <button onClick={() => setSearch("")}>Hapus pencarian</button>
                  </div>
                ) : (
                  <div className="product-grid">
                    {visibleProducts.map((product) => (
                      <ProductItem
                        key={product.id}
                        product={product}
                        variants={variantsMap.get(product.id) ?? []}
                        onAdd={addToCart}
                      />
                    ))}
                  </div>
                )}
              </section>

              {cartOpen && (
                <div
                  className="drawer-backdrop"
                  aria-hidden="true"
                  onClick={() => setCartOpen(false)}
                />
              )}

              <aside
                className={`cart-panel ${cartOpen ? "is-open" : ""}`}
                aria-label="Keranjang pesanan"
              >
                <div className="cart-head">
                  <div className="cart-title">
                    <Icon name="cart" size={20} />
                    Pesanan
                    {itemCount > 0 && <span className="cart-count">{itemCount}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {cart.length > 0 && (
                      <button className="ghost small" onClick={clearCart}>
                        <Icon name="trash" size={15} />
                        Kosongkan
                      </button>
                    )}
                    <button
                      className="cart-close icon-only ghost"
                      aria-label="Tutup keranjang"
                      onClick={() => setCartOpen(false)}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                </div>

                <div className="cart-body">
                  {cart.length === 0 ? (
                    <div className="cart-empty">
                      <Icon name="cart" size={36} />
                      <p>Belum ada item. Pilih menu di sebelah kiri untuk mulai transaksi.</p>
                    </div>
                  ) : (
                    cart.map((line) => (
                      <div
                        className="cart-line"
                        key={`${line.productId}-${line.variantId ?? "base"}`}
                      >
                        <div className="cart-line-main">
                          <div className="cart-name">{line.productName}</div>
                          <div className="cart-sub">
                            {line.variantName ? `${line.variantName} · ` : ""}
                            {formatRupiah(line.unitPriceRp)} × {line.qty}
                          </div>
                        </div>
                        <div className="cart-side">
                          <div className="qty-group">
                            <button
                              className="qty-btn"
                              aria-label={`Kurangi 1 ${line.productName}${line.variantName ? ` ${line.variantName}` : ""}`}
                              onClick={() => changeQty(line.productId, line.variantId, -1)}
                            >
                              <Icon name="minus" size={16} />
                            </button>
                            <span className="qty-value">{line.qty}</span>
                            <button
                              className="qty-btn"
                              aria-label={`Tambah 1 ${line.productName}${line.variantName ? ` ${line.variantName}` : ""}`}
                              onClick={() => changeQty(line.productId, line.variantId, 1)}
                            >
                              <Icon name="plus" size={16} />
                            </button>
                          </div>
                          <div className="cart-line-total money">
                            {formatRupiah(line.unitPriceRp * line.qty)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="cart-foot">
                  <div className="cart-totals">
                    <div className="cart-total-row">
                      <span>Subtotal</span>
                      <span className="money">{formatRupiah(subtotal)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="cart-total-row">
                        <span>Diskon</span>
                        <span className="money">−{formatRupiah(discount)}</span>
                      </div>
                    )}
                    {tax > 0 && (
                      <div className="cart-total-row">
                        <span>Pajak</span>
                        <span className="money">{formatRupiah(tax)}</span>
                      </div>
                    )}
                    {serviceCharge > 0 && (
                      <div className="cart-total-row">
                        <span>Biaya layanan</span>
                        <span className="money">{formatRupiah(serviceCharge)}</span>
                      </div>
                    )}
                    {roundingCalc.roundingRp !== 0 && cart.length > 0 && (
                      <div className="cart-total-row">
                        <span>Pembulatan</span>
                        <span className="money">{formatRupiah(roundingCalc.roundingRp)}</span>
                      </div>
                    )}
                  </div>

                  {/* Diskon/pajak dan catatan dilipat supaya daftar item tetap
                      terlihat di layar 1280x800 / 1024x768. */}
                  <div className="cart-details-row">
                    <details className="cart-extra cart-adjust">
                      <summary>
                        <span className="cart-extra-label">Diskon &amp; pajak</span>
                        {(discount > 0 || tax > 0) && (
                          <span className="cart-extra-flag">aktif</span>
                        )}
                      </summary>
                      <div className="cart-extra-body">
                        <div className="field-row">
                          <label style={{ flex: "1 1 100px", marginBottom: 0 }}>
                            Diskon (Rp)
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={discount}
                              onChange={(e) =>
                                setDiscount(Math.max(0, Number(e.target.value) || 0))
                              }
                            />
                          </label>
                          <label style={{ flex: "1 1 100px", marginBottom: 0 }}>
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
                      </div>
                    </details>

                    <details className="cart-extra cart-note">
                      <summary>
                        <span className="cart-extra-label">
                          Catatan
                          {notes.trim() !== ""
                            ? `: ${notes.trim().slice(0, 16)}${notes.trim().length > 16 ? "…" : ""}`
                            : ""}
                        </span>
                      </summary>
                      <div className="cart-extra-body">
                        <label>
                          Catatan pesanan
                          <input
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="opsional"
                            maxLength={1000}
                          />
                        </label>
                      </div>
                    </details>
                  </div>

                  <div className="cart-total-row is-total">
                    <span className="total-label">Total</span>
                    <span className="total-value money">{formatRupiah(total)}</span>
                  </div>

                  <div className="segmented pay-methods" role="group" aria-label="Metode bayar">
                    <button
                      className={payMethod === "cash" ? "is-active" : ""}
                      aria-pressed={payMethod === "cash"}
                      onClick={() => {
                        setPayMethod("cash");
                        if (payAmount === 0) setPayAmount(total);
                      }}
                    >
                      Tunai
                    </button>
                    <button
                      className={payMethod === "qris_manual" ? "is-active" : ""}
                      aria-pressed={payMethod === "qris_manual"}
                      onClick={() => {
                        setPayMethod("qris_manual");
                        setPayAmount(total);
                      }}
                    >
                      QRIS
                    </button>
                    <button
                      className={payMethod === "other" ? "is-active" : ""}
                      aria-pressed={payMethod === "other"}
                      onClick={() => {
                        setPayMethod("other");
                        setPayAmount(total);
                      }}
                    >
                      Lainnya
                    </button>
                  </div>

                  {payMethod === "cash" ? (
                    <>
                      <div className="pay-amount-row">
                        <label className="pay-amount-label" htmlFor="pay-amount">
                          Dibayar (Rp)
                        </label>
                        <input
                          id="pay-amount"
                          className="pay-amount-input"
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={payAmount}
                          onChange={(e) => setPayAmount(Math.max(0, Number(e.target.value) || 0))}
                        />
                      </div>

                      {quickCash.length > 0 && (
                        <div className="quick-cash" role="group" aria-label="Nominal cepat">
                          {quickCash.map((value) => (
                            <button key={value} onClick={() => setPayAmount(value)}>
                              {value === total ? "Uang pas" : formatRupiah(value)}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="change-row">
                        <span>{payAmount < total ? "Kurang" : "Kembalian"}</span>
                        <strong className={payAmount < total ? "is-short" : ""}>
                          {formatRupiah(
                            payAmount < total
                              ? Math.max(0, total - payAmount)
                              : Math.max(0, payAmount - total),
                          )}
                        </strong>
                      </div>
                    </>
                  ) : payMethod === "qris_manual" ? (
                    <div className="pay-noncash-hint">
                      <Icon name="check" size={15} />
                      <span>Cek notifikasi pembayaran QRIS berhasil sebelum lanjut</span>
                    </div>
                  ) : (
                    <div className="pay-noncash-hint">
                      <Icon name="info" size={15} />
                      <span>Pastikan slip EDC / transfer bank sudah tervalidasi</span>
                    </div>
                  )}

                  <button
                    className="primary pay-btn"
                    disabled={
                      processing ||
                      cart.length === 0 ||
                      (!dbReady && !browserReady) ||
                      payAmount < total
                    }
                    aria-busy={processing}
                    onClick={() => void handleCheckout()}
                  >
                    {processing ? "Memproses…" : `Bayar ${formatRupiah(total)}`}
                  </button>
                </div>
              </aside>

              <button
                className="cart-fab"
                onClick={() => setCartOpen(true)}
                disabled={cart.length === 0}
                aria-label="Buka keranjang"
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="cart" size={20} />
                  Pesanan
                  {itemCount > 0 && <span className="fab-count">{itemCount}</span>}
                </span>
                <span className="fab-total">{formatRupiah(total)}</span>
              </button>
            </div>
          )}

          {view === "riwayat" && (
            <div>
              <div className="history-toolbar">
                <div className="search-box">
                  <Icon name="search" />
                  <input
                    aria-label="Cari riwayat"
                    placeholder="Cari nomor struk atau menu…"
                    value={historyQuery}
                    onChange={(e) => setHistoryQuery(e.target.value)}
                  />
                  {historyQuery !== "" && (
                    <button
                      className="search-clear"
                      aria-label="Hapus pencarian"
                      onClick={() => setHistoryQuery("")}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
                <div className="chip-row" role="group" aria-label="Filter status">
                  {(
                    [
                      ["all", "Semua"],
                      ["completed", "Selesai"],
                      ["voided", "Void"],
                      ["refunded", "Refund"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      className={`chip ${historyFilter === value ? "is-active" : ""}`}
                      aria-pressed={historyFilter === value}
                      onClick={() => setHistoryFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button className="secondary" onClick={() => void handleReload()}>
                  <Icon name="refresh" size={16} />
                  Muat ulang
                </button>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="empty-state">
                  <Icon name="receipt" size={34} />
                  <h3>{orders.length === 0 ? "Belum ada order" : "Tidak ada order yang cocok"}</h3>
                  <p>
                    {orders.length === 0
                      ? "Transaksi yang selesai akan muncul di sini."
                      : "Ubah kata kunci atau filter status untuk melihat order lain."}
                  </p>
                </div>
              ) : (
                <div className="order-list">
                  {groupedOrders.map(([date, list]) => (
                    <section key={date}>
                      <h2 className="order-date">{date}</h2>
                      {list.map((order) => {
                        const expanded = expandedOrders[order.id] === true;
                        return (
                          <div className="order-card" key={order.id} style={{ marginBottom: 8 }}>
                            <div className="order-card-head">
                              <div className="order-main">
                                <div className="order-receipt">
                                  {order.receiptNumber}
                                  <span className={statusBadgeClass(order)}>
                                    {order.status === "completed"
                                      ? "Selesai"
                                      : order.status === "voided"
                                        ? "Void"
                                        : order.status === "refunded"
                                          ? "Refund"
                                          : order.status}
                                  </span>
                                </div>
                                <div className="order-meta">
                                  {new Date(order.createdAt).toLocaleTimeString("id-ID", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}{" "}
                                  · {paymentLabel(order.payment.method)} · {orderItemCount(order)} item
                                  · kembali {formatRupiah(order.changeRp)}
                                </div>
                              </div>
                              <div className="order-total money">
                                {formatRupiah(order.totalRp)}
                                <small>{order.lines.length} baris</small>
                              </div>
                            </div>
                            <div className="order-actions">
                              <button
                                className="ghost small"
                                aria-expanded={expanded}
                                onClick={() => toggleOrderDetail(order.id)}
                              >
                                {expanded ? "Sembunyikan" : "Detail"}
                                <Icon
                                  name={expanded ? "chevronDown" : "chevronRight"}
                                  size={15}
                                />
                              </button>
                              <button className="ghost small" disabled={actionBusyId === order.id} onClick={() => void handlePrint(order)}>
                                <Icon name="printer" size={15} />
                                Cetak
                              </button>
                              {order.status === "completed" && (
                                <>
                                  <button className="warn small" disabled={actionBusyId === order.id} onClick={() => void handleRefund(order.id)}>
                                    <Icon name="refresh" size={15} />
                                    Refund
                                  </button>
                                  <button className="danger small" disabled={actionBusyId === order.id} onClick={() => handleVoid(order.id)}>
                                    <Icon name="trash" size={15} />
                                    Void
                                  </button>
                                </>
                              )}
                            </div>
                            {expanded && (
                              <div className="order-detail">
                                <div className="order-lines">
                                  {order.lines.map((line, index) => (
                                    <div className="order-line" key={`${order.id}-${index}`}>
                                      <span className="order-line-name">
                                        {line.productName}
                                        {line.variantName ? ` · ${line.variantName}` : ""}
                                      </span>
                                      <span className="order-line-qty">
                                        {line.qty} × {formatRupiah(line.unitPriceRp)} ={" "}
                                        <strong>{formatRupiah(line.lineTotalRp)}</strong>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                <div className="order-totals">
                                  <div className="row-between">
                                    <span>Subtotal</span>
                                    <strong>{formatRupiah(order.subtotalRp)}</strong>
                                  </div>
                                  {order.discountRp > 0 && (
                                    <div className="row-between">
                                      <span>Diskon</span>
                                      <strong>−{formatRupiah(order.discountRp)}</strong>
                                    </div>
                                  )}
                                  {order.taxRp > 0 && (
                                    <div className="row-between">
                                      <span>Pajak</span>
                                      <strong>{formatRupiah(order.taxRp)}</strong>
                                    </div>
                                  )}
                                  {order.serviceChargeRp > 0 && (
                                    <div className="row-between">
                                      <span>Biaya layanan</span>
                                      <strong>{formatRupiah(order.serviceChargeRp)}</strong>
                                    </div>
                                  )}
                                  {order.roundingRp !== 0 && (
                                    <div className="row-between">
                                      <span>Pembulatan</span>
                                      <strong>{formatRupiah(order.roundingRp)}</strong>
                                    </div>
                                  )}
                                  <div className="row-between">
                                    <span>Total</span>
                                    <strong>{formatRupiah(order.totalRp)}</strong>
                                  </div>
                                  <div className="row-between">
                                    <span>Dibayar</span>
                                    <strong>{formatRupiah(order.payment.amountRp)}</strong>
                                  </div>
                                  <div className="row-between">
                                    <span>Kembalian</span>
                                    <strong>{formatRupiah(order.changeRp)}</strong>
                                  </div>
                                </div>
                                {order.notes && <p className="order-note">Catatan: {order.notes}</p>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === "laporan" &&
            (reportOrders === null ? (
              <ViewSkeleton label="Memuat laporan…" kind="report" />
            ) : (
              <SalesReport orders={reportOrders} />
            ))}

          {view === "menu" && <CatalogEditor onChanged={() => setCatalogVersion((v) => v + 1)} />}

          {view === "hpp" && <HppEditor />}

          {view === "stok" && <StockEditor />}

          {view === "backup" && (
            <div className="backup-grid">
              <section className="settings-card">
                <div className="settings-card-head">
                  <Icon name="download" />
                  <div>
                    <h3>Backup JSON</h3>
                    <p>Order, menu, HPP, stok, dan setelan dalam satu file.</p>
                  </div>
                </div>
                <p className="muted" style={{ marginBottom: 12 }}>
                  Simpan file ke penyimpanan tablet atau bagikan ke cloud. Lakukan rutin setiap tutup
                  shift.
                </p>
                <button className="primary" onClick={() => void handleBackup()}>
                  <Icon name="download" size={17} />
                  Unduh backup
                </button>
                <h4 className="menu-group-title" style={{ marginTop: 16 }}>
                  Backup terakhir
                </h4>
                {backups.length === 0 ? (
                  <p className="muted">Belum ada backup tercatat.</p>
                ) : (
                  <div className="backup-list">
                    {backups.map((backup) => (
                      <div className="backup-item" key={backup.name + backup.createdAt}>
                        <span title={backup.name}>{backup.name}</span>
                        <span className="muted" style={{ flex: "none" }}>
                          {backup.orderCount} order
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="settings-card">
                <div className="settings-card-head">
                  <Icon name="upload" />
                  <div>
                    <h3>Restore</h3>
                    <p>Kembalikan data dari file backup.</p>
                  </div>
                </div>
                <div className="danger-note" style={{ marginBottom: 12 }}>
                  <Icon name="alert" size={17} />
                  <span>
                    Restore akan <strong>menimpa</strong> order yang ada di tablet ini. Pastikan file
                    backup benar sebelum melanjutkan.
                  </span>
                </div>
                <label>
                  Pilih file backup (.json / .enc.json)
                  <input
                    type="file"
                    accept="application/json,.json,.enc.json"
                    onChange={(e) => {
                      handleRestoreFileSmart(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              </section>

              <section className="settings-card">
                <div className="settings-card-head">
                  <Icon name="lock" />
                  <div>
                    <h3>Backup terenkripsi</h3>
                    <p>AES-GCM + PBKDF2, aman disimpan di cloud.</p>
                  </div>
                </div>
                <label>
                  Passphrase
                  <input
                    type="password"
                    value={backupPass}
                    onChange={(e) => setBackupPass(e.target.value)}
                    placeholder="wajib untuk file .enc"
                    autoComplete="off"
                  />
                </label>
                <button onClick={() => void handleBackupEncrypted()}>
                  <Icon name="lock" size={17} />
                  Unduh .enc.json
                </button>
              </section>

              <section className="settings-card">
                <div className="settings-card-head">
                  <Icon name="cloud" />
                  <div>
                    <h3>Sync ke server</h3>
                    <p>Opsional — untuk rekap cloud / multi-perangkat.</p>
                  </div>
                </div>
                <div className="sync-status">
                  <span>
                    Pending outbox: <strong>{pendingCount === null ? "…" : pendingCount}</strong>
                  </span>
                  <span>
                    Terakhir:{" "}
                    <strong>
                      {syncMeta.lastSyncAt
                        ? new Date(syncMeta.lastSyncAt).toLocaleString("id-ID")
                        : "belum pernah"}
                    </strong>
                  </span>
                  {syncMeta.lastPushed > 0 && (
                    <span>
                      <strong>{syncMeta.lastPushed}</strong> ter-ack
                    </span>
                  )}
                </div>
                {syncMeta.lastError && (
                  <div className="danger-note" style={{ marginBottom: 10 }}>
                    <Icon name="alert" size={16} />
                    <span>Error terakhir: {syncMeta.lastError}</span>
                  </div>
                )}
                <label>
                  Endpoint
                  <input
                    value={syncSettings.endpoint}
                    onChange={(e) =>
                      setSyncSettings({ ...syncSettings, endpoint: e.target.value })
                    }
                    placeholder="https://api.example.invalid"
                    inputMode="url"
                  />
                </label>
                <label>
                  API key
                  <input
                    type="password"
                    value={syncSettings.apiKey}
                    onChange={(e) => setSyncSettings({ ...syncSettings, apiKey: e.target.value })}
                    autoComplete="off"
                  />
                </label>
                <p className="muted">
                  API key hanya disimpan untuk sesi ini (sessionStorage) dan hilang saat aplikasi
                  ditutup.
                </p>
                <div className="row-actions" style={{ justifyContent: "flex-start" }}>
                  <button
                    onClick={() => {
                      saveSyncSettings(syncSettings);
                      setStatus({
                        kind: "ok",
                        msg: "Pengaturan sync disimpan.",
                        scope: "backup",
                      });
                    }}
                  >
                    <Icon name="check" size={16} />
                    Simpan
                  </button>
                  <button
                    className="primary"
                    disabled={syncing}
                    onClick={() => void handleSyncNow()}
                  >
                    <Icon name="sync" size={16} />
                    {syncing ? "Sync…" : "Sync sekarang"}
                  </button>
                </div>
              </section>
            </div>
          )}

          {view === "pengaturan" && (
            <>
              <div className="settings-grid">
                <section className="settings-card">
                  <div className="settings-card-head">
                    <Icon name="store" />
                    <div>
                      <h3>Toko</h3>
                      <p>Identitas yang tampil di struk.</p>
                    </div>
                  </div>
                  <label>
                    Nama toko
                    <input
                      value={settingsDraft.storeName}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, storeName: e.target.value })
                      }
                      placeholder="KOPI POS"
                      maxLength={100}
                    />
                  </label>
                  <label>
                    Nama kasir
                    <input
                      value={settingsDraft.cashierName}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, cashierName: e.target.value })
                      }
                      placeholder="opsional"
                      maxLength={100}
                    />
                  </label>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <Icon name="calculator" />
                    <div>
                      <h3>Transaksi</h3>
                      <p>Biaya tambahan, pembulatan, dan cetak otomatis.</p>
                    </div>
                  </div>
                  <label>
                    Biaya layanan (Rp)
                    <input
                      type="number"
                      min={0}
                      value={settingsDraft.serviceChargeRp}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          serviceChargeRp: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                    />
                  </label>
                  <label>
                    Pembulatan total
                    <select
                      value={settingsDraft.roundingStep}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          roundingStep: Number(e.target.value) as PosSettings["roundingStep"],
                        })
                      }
                    >
                      <option value={0}>Tanpa pembulatan (default)</option>
                      <option value={100}>Ke Rp100 terdekat</option>
                      <option value={500}>Ke Rp500 terdekat</option>
                      <option value={1000}>Ke Rp1.000 terdekat</option>
                    </select>
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={settingsDraft.autoPrint}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, autoPrint: e.target.checked })
                      }
                    />
                    Cetak struk otomatis setelah bayar
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={settingsDraft.blockNegativeStock}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          blockNegativeStock: e.target.checked,
                        })
                      }
                    />
                    Tolak transaksi bila stok bahan tidak cukup
                  </label>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <Icon name="lock" />
                    <div>
                      <h3>Keamanan</h3>
                      <p>Lindungi void dari tangan yang tidak berwenang.</p>
                    </div>
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={settingsDraft.requireVoidPin}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, requireVoidPin: e.target.checked })
                      }
                    />
                    Minta PIN saat void
                  </label>
                  {posSettings.voidPinHash !== "" && (
                    <label>
                      PIN saat ini (verifikasi otorisasi)
                      <input
                        type="password"
                        value={currentPinDraft}
                        onChange={(e) => setCurrentPinDraft(e.target.value.slice(0, 32))}
                        placeholder="masukkan PIN saat ini untuk simpan"
                        autoComplete="current-password"
                      />
                    </label>
                  )}
                  <label>
                    PIN void (baru)
                    <input
                      type="password"
                      value={voidPinDraft}
                      onChange={(e) => setVoidPinDraft(e.target.value.slice(0, 32))}
                      placeholder={
                        settingsDraft.voidPinHash !== ""
                          ? "kosongkan bila tidak ganti PIN"
                          : "isi bila PIN void aktif"
                      }
                      autoComplete="new-password"
                    />
                  </label>
                  <p className="muted">
                    {settingsDraft.voidPinHash !== ""
                      ? "PIN sudah diset. Masukkan PIN saat ini bila ingin mengubah keamanan/PIN."
                      : "PIN disimpan sebagai hash PBKDF2 + salt, bukan teks biasa."}
                  </p>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <Icon name="printer" />
                    <div>
                      <h3>Printer Bluetooth</h3>
                      <p>Thermal 58 mm. Pasangkan lewat setelan Android.</p>
                    </div>
                  </div>
                  <div className="shift-box">
                    <span>
                      Status:{" "}
                      <strong>
                        {printerState.connected
                          ? `terhubung — ${printerState.name ?? printerState.address ?? ""}`
                          : "belum terhubung"}
                      </strong>
                    </span>
                  </div>
                  <div className="row-actions" style={{ justifyContent: "flex-start" }}>
                    <button disabled={printerBusy} onClick={() => void handleScanPrinters()}>
                      <Icon name="search" size={16} />
                      {printerBusy ? "Memindai…" : "Cari printer"}
                    </button>
                    {printerState.connected && (
                      <button disabled={printerBusy} onClick={() => void handleDisconnectPrinter()}>
                        Putuskan
                      </button>
                    )}
                  </div>
                  {printerDevices.length > 0 && (
                    <div className="printer-list">
                      {printerDevices.map((device) => (
                        <div className="printer-row" key={device.address}>
                          <span>
                            {device.name || "(tanpa nama)"} · {device.address}
                          </span>
                          <button
                            className="small"
                            disabled={printerBusy}
                            onClick={() => void handleConnectPrinter(device.address)}
                          >
                            Hubungkan
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <Icon name="store" />
                    <div>
                      <h3>Logo Struk</h3>
                      <p>Cetak logo di bagian atas struk thermal 58 mm.</p>
                    </div>
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={settingsDraft.printLogo}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, printLogo: e.target.checked })
                      }
                    />
                    Cetak logo di struk
                  </label>
                  {settingsDraft.printLogo && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div
                        style={{
                          padding: 12,
                          border: "1px dashed var(--line)",
                          borderRadius: 8,
                          textAlign: "center",
                          background: "var(--surface-2)",
                        }}
                      >
                        <img
                          src={settingsDraft.logoBase64 || "assets/logo.png"}
                          alt="Pratinjau Logo"
                          style={{
                            maxWidth: 160,
                            maxHeight: 70,
                            objectFit: "contain",
                            margin: "0 auto",
                            display: "block",
                          }}
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                        <span className="muted" style={{ fontSize: "0.75rem", display: "block", marginTop: 6 }}>
                          {settingsDraft.logoBase64 ? "Menggunakan logo kustom" : "Menggunakan logo bawaan (assets/logo.png)"}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <label
                          className="button ghost small"
                          style={{
                            margin: 0,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Icon name="upload" size={15} />
                          Pilih Gambar Logo
                          <input
                            type="file"
                            accept="image/png, image/jpeg, image/webp"
                            style={{ display: "none" }}
                            onChange={handleLogoFileChange}
                          />
                        </label>
                        {settingsDraft.logoBase64 !== "" && (
                          <button
                            type="button"
                            className="ghost small"
                            onClick={() => {
                              setSettingsDraft((prev) => ({ ...prev, logoBase64: "" }));
                              setStatus({ kind: "info", msg: "Logo dikembalikan ke bawaan.", scope: "pengaturan" });
                            }}
                          >
                            Reset Bawaan
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <Icon name="clock" />
                    <div>
                      <h3>Shift</h3>
                      <p>Rekap uang laci per sesi kasir.</p>
                    </div>
                  </div>
                  {shift ? (
                    <>
                      <div className="shift-box">
                        <span>
                          Shift berjalan: <strong>{shift.cashierName || "(tanpa nama)"}</strong>
                        </span>
                        <span>
                          Dibuka {new Date(shift.openedAt).toLocaleString("id-ID")}
                          {shift.openCashRp > 0 && ` · Modal awal: ${formatRupiah(shift.openCashRp)}`}
                        </span>
                        {shiftSummary && (
                          <span>
                            {isShiftTruncated ? "≥" : ""}{shiftSummary.orderCount} order ·{" "}
                            <strong>{formatRupiah(shiftSummary.grandTotalRp)}</strong>
                            {isShiftTruncated && <small className="muted"> (dari 200 order terbaru)</small>}
                          </span>
                        )}
                      </div>
                      <button onClick={() => void handleCloseShift()}>
                        <Icon name="check" size={16} />
                        Tutup shift
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="shift-box">
                        <span>
                          Tidak ada shift berjalan. Kasir:{" "}
                          <strong>{posSettings.cashierName || "(belum diisi)"}</strong>
                        </span>
                        <label style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-2)" }}>Modal awal kas laci:</span>
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={openCashDraft || ""}
                            onChange={(e) => setOpenCashDraft(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            placeholder="Rp0"
                            style={{ maxWidth: 200 }}
                          />
                        </label>
                      </div>
                      <button
                        className="primary"
                        onClick={() => {
                          setLastShiftSummary(null);
                          setShift(openShift(posSettings.cashierName, openCashDraft));
                          setOpenCashDraft(0);
                          setStatus({ kind: "ok", msg: "Shift dibuka.", scope: "pengaturan" });
                        }}
                      >
                        <Icon name="clock" size={16} />
                        Buka shift
                      </button>
                    </>
                  )}
                  {lastShiftSummary && (
                    <p className="muted" style={{ marginTop: 10 }}>
                      Ringkasan terakhir: {lastShiftSummary}
                    </p>
                  )}
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <Icon name="cloud" />
                    <div>
                      <h3>Sistem & Pembaruan</h3>
                      <p>Pembaruan live OTA tanpa install ulang APK.</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Versi Aplikasi:</span>
                      <strong>v{APP_VERSION}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Sumber Rilis:</span>
                      <span className="muted" style={{ fontSize: "0.85rem" }}>GitHub Releases</span>
                    </div>
                    {updateStatusMsg && (
                      <div className="ota-status-msg">{updateStatusMsg}</div>
                    )}
                    {availableUpdate && (
                      <div className="ota-available-box">
                        <div>
                          <strong>Versi {availableUpdate.tagName} Tersedia!</strong>
                          <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--text-2)" }}>
                            Ukuran: {(availableUpdate.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                          </p>
                        </div>
                        <button
                          type="button"
                          className="primary small"
                          onClick={() => setShowUpdateModal(true)}
                        >
                          Lihat Detail
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      className="ghost small"
                      disabled={updateChecking}
                      onClick={() => void handleCheckUpdateManual()}
                      style={{ marginTop: 6 }}
                    >
                      <Icon name="refresh" size={15} />
                      {updateChecking ? "Memeriksa…" : "Periksa Pembaruan"}
                    </button>
                  </div>
                </section>
              </div>

              <div className="sticky-save">
                <span className="muted">
                  Perubahan berlaku setelah tombol simpan ditekan.
                </span>
                <button
                  className="primary"
                  disabled={settingsSaving}
                  onClick={() => void handleSaveSettings()}
                >
                  <Icon name="check" size={17} />
                  {settingsSaving ? "Menyimpan…" : "Simpan pengaturan"}
                </button>
              </div>
            </>
          )}
          </Suspense>
        </div>
      </main>

      {status && (
        <div
          className={`toast is-${status.kind}`}
          role={status.kind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <span className="toast-icon">
            <Icon
              name={status.kind === "error" ? "alert" : status.kind === "ok" ? "check" : "info"}
              size={18}
            />
          </span>
          <div className="toast-msg">{status.msg}</div>
          <button className="toast-close" aria-label="Tutup notifikasi" onClick={() => setStatus(null)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {lastReceipt && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLastReceipt(null);
          }}
        >
          <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
            <div className="modal-head">
              <div>
                <div className="modal-icon">
                  <Icon name="check" size={24} />
                </div>
                <div className="modal-title" id="receipt-title">
                  Pembayaran berhasil
                </div>
                <div className="modal-sub">
                  Order {lastReceipt.order.receiptNumber} ·{" "}
                  {formatRupiah(lastReceipt.order.totalRp)}
                </div>
              </div>
              <button
                className="modal-close"
                aria-label="Tutup"
                onClick={() => setLastReceipt(null)}
              >
                <Icon name="close" />
              </button>
            </div>

            <div className="cart-total-row is-total">
              <span className="total-label">Kembalian</span>
              <span className="total-value money">
                {formatRupiah(lastReceipt.order.changeRp)}
              </span>
            </div>

            <details className="cart-extra" style={{ marginTop: 12 }}>
              <summary>Lihat struk</summary>
              <div style={{ background: "var(--surface)", padding: 12, borderRadius: 8, marginTop: 8 }}>
                {posSettings.printLogo && (
                  <div style={{ textAlign: "center", marginBottom: 8 }}>
                    <img
                      src={posSettings.logoBase64 || "assets/logo.png"}
                      alt="Logo Toko"
                      style={{ maxWidth: 140, maxHeight: 70, objectFit: "contain", display: "inline-block" }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
                <pre className="receipt-preview" style={{ margin: 0 }}>{lastReceipt.text}</pre>
              </div>
            </details>

            <div className="modal-actions">
              <button onClick={() => void handlePrint(lastReceipt.order, "kasir")}>
                <Icon name="printer" size={17} />
                Cetak lagi
              </button>
              <button className="primary" onClick={() => setLastReceipt(null)}>
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {pinRequest && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pinVerifying) {
              setPinRequest(null);
              setPinInput("");
              setPinError(null);
            }
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pin-title">
            <div className="modal-head">
              <div>
                <div className="modal-title" id="pin-title">
                  {pinRequest.action === "refund" ? "PIN refund" : "PIN void"}
                </div>
                <div className="modal-sub">
                  {pinRequest.action === "refund" ? "Refund" : "Void"} order {pinRequest.label} butuh PIN.
                </div>
              </div>
              <button
                className="modal-close"
                aria-label="Batal"
                disabled={pinVerifying}
                onClick={() => {
                  setPinRequest(null);
                  setPinInput("");
                  setPinError(null);
                }}
              >
                <Icon name="close" />
              </button>
            </div>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              aria-label={pinRequest.action === "refund" ? "PIN refund" : "PIN void"}
              value={pinInput}
              disabled={pinVerifying}
              onChange={(e) => {
                setPinInput(e.target.value.slice(0, 32));
                setPinError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmVoidPin();
              }}
              style={{ minHeight: 52, fontSize: 22, textAlign: "center", letterSpacing: "0.2em" }}
            />
            {pinError && (
              <p className="muted" style={{ color: "var(--danger)", marginTop: 8 }}>
                {pinError}
              </p>
            )}
            <div className="modal-actions">
              <button
                disabled={pinVerifying}
                onClick={() => {
                  setPinRequest(null);
                  setPinInput("");
                  setPinError(null);
                }}
              >
                Batal
              </button>
              <button
                className="primary"
                disabled={pinVerifying}
                onClick={() => void confirmVoidPin()}
              >
                {pinVerifying ? "Memeriksa…" : "Lanjut"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpdateModal && availableUpdate && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (updateProgress === null) setShowUpdateModal(false);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 520 }}
          >
            <div className="modal-head">
              <div>
                <div className="modal-title">Pembaruan Tersedia</div>
                <div className="modal-sub">Versi baru siap diunduh dan dipasang</div>
              </div>
              {updateProgress === null && (
                <button
                  className="modal-close"
                  aria-label="Tutup"
                  onClick={() => setShowUpdateModal(false)}
                >
                  <Icon name="close" size={18} />
                </button>
              )}
            </div>
            <div className="ota-modal-body">
              <div className="ota-meta-row">
                <span>Versi saat ini: <strong>v{APP_VERSION}</strong></span>
                <span>Versi baru: <strong style={{ color: "var(--accent)" }}>{availableUpdate.tagName}</strong></span>
                <span>Ukuran paket: <strong>{(availableUpdate.sizeBytes / (1024 * 1024)).toFixed(2)} MB</strong></span>
              </div>
              <div className="ota-notes-box">
                <strong style={{ display: "block", marginBottom: 6, color: "var(--text-1)" }}>
                  Catatan Rilis:
                </strong>
                {availableUpdate.notes}
              </div>
              {updateProgress !== null && (
                <div className="ota-progress-wrap">
                  <div className="ota-progress-bar" style={{ width: `${updateProgress}%` }} />
                  <span className="ota-progress-text">Mengunduh: {updateProgress}%</span>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button
                disabled={updateProgress !== null}
                onClick={() => setShowUpdateModal(false)}
              >
                Nanti Saja
              </button>
              <button
                className="primary"
                disabled={updateProgress !== null}
                onClick={() => void handleApplyUpdate(availableUpdate)}
              >
                <Icon name="download" size={16} />
                {updateProgress !== null ? "Memasang…" : "Perbarui & Terapkan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
