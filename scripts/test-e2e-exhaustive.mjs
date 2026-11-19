// E2E menyeluruh UI baru (Tailwind + shadcn/ui) tanpa dependency baru.
//
// Menjalankan `vite preview` dari hasil build, membuka Chromium headless lewat
// CDP, lalu menguji alur nyata di mode browser (localStorage): shift, katalog,
// keranjang multi-varian, diskon/pajak/layanan/pembulatan, pembayaran, struk,
// riwayat (void/refund ber-PIN), laporan, profil toko, dan order cacat.
//
// Pakai: `npm run build && npm run test:e2e`
// Butuh Chromium/Chrome. Set CHROMIUM_BIN bila lokasinya tidak standar.
// Keluar dengan kode 1 bila ada pengecekan gagal atau terjadi error fatal.
import { spawn, spawnSync } from "node:child_process";
import WebSocket from "ws";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = Number(process.env.E2E_PORT || 4198);
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9438);
const URL = `http://localhost:${PORT}/`;
const CDP_TIMEOUT_MS = 30_000;

const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_BIN,
  "chromium",
  "chromium-browser",
  "google-chrome",
  "google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/sbin/chromium",
].filter(Boolean);

let passed = 0;
const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ GAGAL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function findChromium() {
  for (const candidate of CHROMIUM_CANDIDATES) {
    if (candidate.includes("/")) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    const res = spawnSync("which", [candidate], { encoding: "utf8" });
    const bin = res.stdout?.trim();
    if (bin) return bin;
  }
  return null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // server belum siap
    }
    await wait(200);
  }
  return false;
}

// Helper yang disisipkan ke setiap evaluasi di halaman.
const PAGE_HELPERS = `
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const txt = (el) => (el?.textContent ?? "").replace(/\\s+/g, " ").trim();
  const btn = (label, scope = document, mode = "exact") =>
    $$("button", scope).find((b) => {
      const t = txt(b);
      return mode === "exact" ? t === label : mode === "start" ? t.startsWith(label) : t.includes(label);
    });
  const dialogs = () => $$('[role="dialog"], [role="alertdialog"]');
  const topDialog = () => dialogs().at(-1) ?? null;
  const nav = (label) => $$('[data-testid="nav"] [data-testid="nav-item"]').find((b) => txt(b) === label);
  const setValue = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const inside = (el, box) => {
    const a = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    return a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
  };
  const overlaps = (x, y) => {
    const a = x.getBoundingClientRect(), b = y.getBoundingClientRect();
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  };
  const storedOrders = () => JSON.parse(localStorage.getItem("pos.orders.v1") || '{"orders":[]}').orders;
  const cartTotal = () => {
    const label = $$('[data-testid="cart-panel"] span').find((s) => txt(s) === "Total");
    return txt(label?.nextElementSibling);
  };
  const summaryRow = (name) => {
    const label = $$('[data-testid="cart-panel"] span').find((s) => txt(s) === name);
    return label ? txt(label.nextElementSibling) : null;
  };
`;

async function main() {
  if (!existsSync(path.join(ROOT, "dist", "index.html"))) {
    throw new Error("dist/index.html belum ada. Jalankan `npm run build` dulu.");
  }
  const chromium = findChromium();
  if (!chromium) throw new Error("Chromium tidak ditemukan. Set CHROMIUM_BIN.");

  const profileDir = mkdtempSync(path.join(tmpdir(), "pos-e2e-"));
  const preview = spawn(
    process.execPath,
    [path.join(ROOT, "node_modules/vite/bin/vite.js"), "preview", "--port", String(PORT), "--strictPort"],
    { cwd: ROOT, stdio: "ignore" },
  );
  let previewExit = null;
  preview.on("exit", (code) => {
    previewExit = code;
  });

  let browser;
  let ws;
  try {
    if (!(await waitForHttp(URL)) || previewExit !== null) {
      throw new Error(`Preview tidak merespons di ${URL} (port terpakai?)`);
    }

    browser = spawn(
      chromium,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-extensions",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${profileDir}`,
        "about:blank",
      ],
      { stdio: "ignore" },
    );

    if (!(await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`))) {
      throw new Error("Chromium CDP tidak merespons.");
    }

    const ver = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
    ws = new WebSocket(ver.webSocketDebuggerUrl);

    let id = 0;
    const pending = new Map();
    const consoleErrors = [];
    // Tanpa timeout dan penolakan saat soket tertutup, perintah CDP yang
    // tidak pernah dijawab (Chromium crash) membuat skrip menggantung.
    const send = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const i = ++id;
        const timer = setTimeout(() => {
          pending.delete(i);
          reject(new Error(`CDP ${method} timeout`));
        }, CDP_TIMEOUT_MS);
        pending.set(i, {
          resolve: (v) => (clearTimeout(timer), resolve(v)),
          reject: (e) => (clearTimeout(timer), reject(e)),
        });
        ws.send(JSON.stringify({ id: i, method, params, sessionId }));
      });

    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });

    ws.addEventListener("close", () => {
      for (const p of pending.values()) p.reject(new Error("Koneksi CDP tertutup."));
      pending.clear();
    });
    ws.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.method === "Log.entryAdded" && data.params?.entry?.level === "error") {
        consoleErrors.push(data.params.entry.text);
      }
      if (data.method === "Runtime.exceptionThrown") {
        const d = data.params?.exceptionDetails;
        consoleErrors.push(d?.exception?.description ?? d?.text ?? "exception");
      }
      if (data.method === "Runtime.consoleAPICalled" && data.params?.type === "error") {
        consoleErrors.push(data.params.args?.map((a) => a.value ?? a.description).join(" ") ?? "console.error");
      }
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error.message));
      else p.resolve(data.result);
    });

    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Page.enable", {}, sessionId);
    await send("Runtime.enable", {}, sessionId);
    await send("Log.enable", {}, sessionId);

    const evalJs = async (expression) => {
      const res = await send(
        "Runtime.evaluate",
        { expression, returnByValue: true, awaitPromise: true },
        sessionId,
      );
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
      }
      return res.result?.value;
    };
    /** Menjalankan badan fungsi di halaman dengan PAGE_HELPERS tersedia. */
    const page = (body) => evalJs(`(async () => { ${PAGE_HELPERS}\n${body}\n})()`);
    /** Nilai dari satu ekspresi di halaman. */
    const pageValue = (expr) => page(`return (${expr});`);
    const waitFor = async (expr, timeoutMs = 8000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await pageValue(expr)) return true;
        await wait(100);
      }
      return false;
    };
    const reload = async () => {
      await send("Page.reload", { ignoreCache: true }, sessionId);
      await waitFor("document.readyState === 'complete'");
      await wait(600);
    };
    /** Klik mouse sungguhan (pointer events) — dibutuhkan Radix Select. */
    const realClick = async (expr) => {
      const box = await page(`
        const el = (${expr});
        if (!el) return null;
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      `);
      if (!box) return false;
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
        await send(
          "Input.dispatchMouseEvent",
          { type, x: box.x, y: box.y, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 },
          sessionId,
        );
      }
      return true;
    };
    const goTo = async (label) => {
      const ok = await page(`const b = nav(${JSON.stringify(label)}); b?.click(); return !!b;`);
      if (!ok) throw new Error(`Menu navigasi '${label}' tidak ditemukan.`);
      await wait(150);
    };
    const dismissToasts = async () => {
      await page(`$$('[data-sonner-toast] [data-close-button]').forEach((b) => b.click()); return true;`);
      await waitFor("!document.querySelector('[data-sonner-toast]')", 6000);
    };
    const errorToasts = () =>
      pageValue(`$$('[data-sonner-toast][data-type="error"]').map((t) => txt(t))`);
    const enterPin = async (pin) => {
      await page(`
        setValue($("#riwayat-void-pin"), ${JSON.stringify(pin)});
        return true;
      `);
      await wait(50);
      await page(`btn("Lanjut", topDialog())?.click(); return true;`);
    };

    await send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await send("Page.navigate", { url: URL }, sessionId);
    await waitFor("document.readyState === 'complete'");

    // ------------------------------------------------------------------
    console.log("\n[TEST 1] Inisialisasi Toko, Shift & Katalog Menu");
    const logoFile = path.join(ROOT, "public/logo.png");
    const logoBase64 = existsSync(logoFile) ? `data:image/png;base64,${readFileSync(logoFile).toString("base64")}` : "";

    await evalJs(`(() => {
      localStorage.clear();
      localStorage.setItem("pos.settings.v1", JSON.stringify({
        storeName: "KEDAI CONTOH",
        address: "Jl. Moh. Yamin 84A, Kawatan, Serengan, Surakarta",
        phone: "0812-2888-0820",
        footerMessage: "Matur nuwun sampun rawuh!",
        paperWidth: 58,
        taxPercent: 0,
        servicePercent: 0,
        roundingStep: 0,
        cashierName: "Barista Kian",
        autoPrint: true,
        printLogo: true,
        logoBase64: ${JSON.stringify(logoBase64)},
        requireVoidPin: true,
        // PIN 1234 ter-hash PBKDF2 (600.000 iterasi OWASP, Base64)
        voidPinHash: "bAZuj6eVNtc4F7IB+ibcen80rrPmBa8ecqxndX2YJj8=",
        voidPinSalt: "rHC5h8Ag89MbyGuolpNXlA=="
      }));
      localStorage.setItem("pos.shift.v1", JSON.stringify({
        id: "shift-e2e-01",
        cashierName: "Barista Kian",
        openedAt: new Date().toISOString(),
        closedAt: null,
        openCashRp: 200000
      }));
      localStorage.setItem("pos.catalog.v1", JSON.stringify({
        categories: [
          { id: "cat-sig", name: "Signature 08.20", sortOrder: 0 },
          { id: "cat-esp", name: "Espresso Based", sortOrder: 1 }
        ],
        products: [
          {
            id: "prod-escobar",
            categoryId: "cat-sig",
            name: "08.20 Escobar",
            basePriceRp: 38000,
            isActive: true,
            variants: [
              { id: "var-reg", productId: "prod-escobar", name: "Regular", priceDeltaRp: 0, isActive: true },
              { id: "var-lg", productId: "prod-escobar", name: "Large", priceDeltaRp: 4000, isActive: true }
            ]
          },
          {
            id: "prod-kopsus",
            categoryId: "cat-sig",
            name: "Es Kopi Aren",
            basePriceRp: 24000,
            isActive: true,
            variants: []
          }
        ]
      }));
      localStorage.setItem("pos.orders.v1", JSON.stringify({ schemaVersion: 1, orders: [] }));
      localStorage.setItem("pos.cart.v1", JSON.stringify([]));
      return true;
    })()`);

    await reload();
    await waitFor("document.body.innerText.includes('08.20 Escobar')");

    check("Nama toko 'KEDAI CONTOH' tampil di header", await pageValue("txt($('header p')).includes('KEDAI CONTOH')"));
    const shiftPill = await pageValue("$$('header span').map(txt).find((t) => t.startsWith('Shift')) ?? ''");
    check("Shift berjalan dengan kasir 'Barista Kian'", shiftPill === "Shift · Barista Kian", `Dapat: ${shiftPill}`);
    check(
      "Menu multi-varian '08.20 Escobar' menampilkan badge varian",
      await pageValue(`txt($('[aria-label="Pilih varian 08.20 Escobar"]')).toUpperCase().includes('2 VARIAN')`),
    );
    check(
      "Isi kartu menu (harga, badge varian) tidak keluar dari kartu",
      await pageValue(`$$('[data-testid="product-tile"]').every((t) => $$('span', t).every((s) => inside(s, t)))`),
    );
    check("Menu tanpa varian menampilkan tombol Tambah", await waitFor(`!!$('[aria-label="Tambah Es Kopi Aren"]')`));

    // ------------------------------------------------------------------
    console.log("\n[TEST 2] Keranjang & Aritmetika Multi-Varian");
    await page(`$('[aria-label="Pilih varian 08.20 Escobar"]').click(); return true;`);
    check("Pemilih varian terbuka", await waitFor(`!!$('[aria-label="Tambah 08.20 Escobar Large"]')`));
    const variantPrices = await pageValue(
      `$$('[role="dialog"] [aria-label^="Tambah 08.20 Escobar"]').map((b) => txt(b))`,
    );
    check(
      "Harga varian di pemilih: Regular Rp38.000, Large Rp42.000",
      variantPrices?.some((t) => t.startsWith("Regular") && t.includes("38.000")) &&
        variantPrices?.some((t) => t.startsWith("Large") && t.includes("42.000")),
      JSON.stringify(variantPrices),
    );
    await page(`$('[aria-label="Tambah 08.20 Escobar Large"]').click(); return true;`);
    await waitFor(`!!$('[data-testid="cart-line"]') && !topDialog()`);
    check("Item varian Large masuk keranjang", await pageValue(`txt($('[data-testid="cart-line"]')).includes('Large')`));
    check(
      "Harga varian Large Rp42.000",
      await pageValue(`txt($('[data-testid="cart-line-total"]')).includes('42.000')`),
    );

    await page(`$('[aria-label="Tambah Es Kopi Aren"]').click(); return true;`);
    await waitFor(`$$('[data-testid="cart-line"]').length === 2`);
    await page(`$('[aria-label="Tambah 1 Es Kopi Aren"]').click(); return true;`);
    await waitFor(`$$('[data-testid="cart-line-total"]').some((el) => txt(el).includes('48.000'))`);
    check(
      "Qty Es Kopi Aren jadi 2 (Rp48.000)",
      await pageValue(`$$('[data-testid="cart-line"]').some((l) => txt(l).includes('Es Kopi Aren') && txt(l).includes('48.000'))`),
    );

    const totalText = await pageValue("cartTotal()");
    check("Subtotal & Total keranjang tepat Rp90.000 (Integer Arithmetic)", totalText.includes("90.000"), `Dapat: ${totalText}`);
    check("Subtotal keranjang Rp90.000", (await pageValue("summaryRow('Subtotal')"))?.includes("90.000"));

    // ------------------------------------------------------------------
    console.log("\n[TEST 3] Smart Payment Switcher (QRIS vs Tunai)");
    await page(`btn("Bayar", $('[data-testid="cart-panel"]'), "start")?.click(); return true;`);
    check("Dialog pembayaran terbuka", await waitFor(`!!$('[data-testid="payment-dialog"]')`));
    check(
      "Dialog pembayaran menampilkan total Rp90.000",
      await pageValue(`txt($('[data-testid="payment-dialog"]')).includes('90.000')`),
    );

    await page(`btn("QRIS", $('[data-testid="payment-dialog"]'))?.click(); return true;`);
    await waitFor(`btn("QRIS", $('[data-testid="payment-dialog"]'))?.getAttribute('aria-pressed') === 'true'`);
    check(
      "Mode QRIS: hint notifikasi QRIS tampil",
      await pageValue(`txt($('[data-testid="payment-dialog"]')).includes('notifikasi pembayaran QRIS')`),
    );
    check("Mode QRIS: kolom uang tunai & kembalian disembunyikan", await pageValue(`!$('#pay-amount') && !$('[data-testid="change-due"]')`));

    await page(`btn("Tunai", $('[data-testid="payment-dialog"]'))?.click(); return true;`);
    await wait(200);
    check("Mode Tunai: input nominal uang tunai kembali tampil", await waitFor(`!!$('#pay-amount')`));
    check("Mode Tunai: tombol quick cash tampil", await pageValue(`!!$('[aria-label="Nominal cepat"] button')`));
    check(
      "Tombol selesaikan nonaktif sebelum uang cukup",
      await pageValue(`btn("Selesaikan", $('[data-testid="payment-dialog"]'), "start")?.disabled === true`),
    );

    const quick = await page(`
      const b = $$('[aria-label="Nominal cepat"] button').find((x) => txt(x).includes('100.000'));
      if (b) { b.click(); return "quick"; }
      setValue($('#pay-amount'), '100000');
      return "typed";
    `);
    await wait(300);
    check("Quick cash Rp100.000 tersedia", quick === "quick");
    const changeText = await pageValue(`txt($('[data-testid="change-due"]'))`);
    check(
      "Kalkulasi Kembalian tepat Rp10.000 (100.000 - 90.000)",
      changeText.includes("Kembalian") && changeText.includes("10.000"),
      `Dapat: ${changeText}`,
    );

    // ------------------------------------------------------------------
    console.log("\n[TEST 4] Checkout & Pratinjau Struk dengan Logo");
    const finished = await waitFor(`(() => {
      const b = btn("Selesaikan", $('[data-testid="payment-dialog"]'), "start");
      if (!b || b.disabled) return false;
      b.click();
      return true;
    })()`);
    check("Tombol Selesaikan bisa ditekan", finished);
    check("Modal Pembayaran Berhasil terbuka", await waitFor(`!!$('[data-testid="receipt-preview"]')`));
    check("Dialog pembayaran tertutup setelah selesai", await waitFor(`!$('[data-testid="payment-dialog"]')`));
    const receiptDialog = `$('[data-testid="receipt-preview"]').closest('[role="dialog"]')`;
    check(
      "Kembalian di modal struk tepat Rp10.000",
      await pageValue(`(() => {
        const label = $$('p', ${receiptDialog}).find((p) => txt(p) === 'Kembalian');
        return txt(label?.nextElementSibling).includes('10.000');
      })()`),
    );
    check("Logo Toko tampil di pratinjau struk", await pageValue(`!!$('img[alt="Logo Toko"]', ${receiptDialog})`));
    const receiptText = await pageValue(`$('[data-testid="receipt-preview"]').textContent`);
    check("Teks struk memuat nama toko KEDAI CONTOH", receiptText.includes("KEDAI CONTOH"));
    check("Teks struk memuat item varian (08.20 Escobar - Regular/Large)", receiptText.includes("08.20 Escobar") && receiptText.includes("Large"));
    check("Teks struk memuat total Rp90.000", receiptText.includes("90.000"));

    await page(`btn("Selesai", ${receiptDialog})?.click(); return true;`);
    await waitFor(`!$('[data-testid="receipt-preview"]')`);
    check(
      "Modal struk tertutup bersih, keranjang kembali kosong",
      await waitFor(`!$('[data-testid="receipt-preview"]') && $$('[data-testid="cart-line"]').length === 0`),
    );
    const firstOrder = await pageValue("storedOrders()[0] ?? null");
    check(
      "Order pertama tersimpan: total 90.000, bayar 100.000, kembali 10.000",
      firstOrder?.totalRp === 90000 && firstOrder?.payment?.amountRp === 100000 && firstOrder?.changeRp === 10000,
      JSON.stringify(firstOrder && { total: firstOrder.totalRp, pay: firstOrder.payment, change: firstOrder.changeRp }),
    );

    // ------------------------------------------------------------------
    console.log("\n[TEST 5] Diskon, Pajak, Biaya Layanan & Pembulatan");
    await goTo("Setelan");
    await waitFor(`!!$('[data-testid="settings-tab-kasir"]')`);
    await realClick(`$('[data-testid="settings-tab-kasir"]')`);
    check("Tab Kasir di Pengaturan terbuka", await waitFor(`!!$('#service-charge') && $('#service-charge').offsetParent !== null`));
    await page(`setValue($('#service-charge'), '1300'); return true;`);
    await realClick(`$('#rounding-step')`);
    await waitFor(`$$('[role="option"]').length > 0`);
    await realClick(`$$('[role="option"]').find((o) => txt(o).includes('Rp500'))`);
    check("Pembulatan Rp500 terpilih", await waitFor(`txt($('#rounding-step')).includes('Rp500')`));
    await dismissToasts();
    await page(`$('[data-testid="settings-save"]').click(); return true;`);
    check("Pengaturan kasir tersimpan", await waitFor("document.body.innerText.includes('Pengaturan disimpan.')"));
    const savedSettings = await pageValue(`JSON.parse(localStorage.getItem('pos.settings.v1'))`);
    check(
      "Biaya layanan Rp1.300 & pembulatan 500 tersimpan",
      savedSettings?.serviceChargeRp === 1300 && savedSettings?.roundingStep === 500,
      JSON.stringify({ s: savedSettings?.serviceChargeRp, r: savedSettings?.roundingStep }),
    );

    await goTo("Kasir");
    await waitFor(`!!$('[aria-label="Pilih varian 08.20 Escobar"]')`);
    await page(`$('[aria-label="Pilih varian 08.20 Escobar"]').click(); return true;`);
    await waitFor(`!!$('[aria-label="Tambah 08.20 Escobar Regular"]')`);
    await page(`$('[aria-label="Tambah 08.20 Escobar Regular"]').click(); return true;`);
    await waitFor(`!topDialog()`);
    await page(`$('[aria-label="Tambah Es Kopi Aren"]').click(); return true;`);
    await waitFor(`$$('[data-testid="cart-line"]').length === 2`);
    check("Subtotal Rp62.000 (38.000 + 24.000)", (await pageValue("summaryRow('Subtotal')"))?.includes("62.000"));
    check("Biaya layanan Rp1.300 tampil di keranjang", (await pageValue("summaryRow('Biaya layanan')"))?.includes("1.300"));

    await page(`btn("Diskon & pajak", $('[data-testid="cart-panel"]'))?.click(); return true;`);
    check("Dialog diskon & pajak terbuka", await waitFor(`!!$('#cart-discount')`));
    await page(`setValue($('#cart-discount'), '70000'); return true;`);
    await wait(150);
    check(
      "Diskon melebihi subtotal ditolak (Terapkan nonaktif)",
      await pageValue(`document.body.innerText.includes('Diskon melebihi subtotal') && btn("Terapkan", topDialog())?.disabled === true`),
    );
    await page(`setValue($('#cart-discount'), '2000'); setValue($('#cart-tax'), '6000'); return true;`);
    await wait(150);
    await page(`btn("Terapkan", topDialog())?.click(); return true;`);
    await waitFor(`!$('#cart-discount')`);
    const rows = await pageValue(`({
      diskon: summaryRow('Diskon'),
      pajak: summaryRow('Pajak'),
      layanan: summaryRow('Biaya layanan'),
      bulat: summaryRow('Pembulatan'),
      total: cartTotal(),
    })`);
    check("Diskon Rp2.000 tampil", rows.diskon?.includes("2.000"), JSON.stringify(rows));
    check("Pajak Rp6.000 tampil", rows.pajak?.includes("6.000"));
    check("Pembulatan −Rp300 (67.300 → 67.000, ke bawah)", rows.bulat?.includes("300") && rows.bulat?.includes("-"), rows.bulat ?? "");
    check("Total 62.000 − 2.000 + 6.000 + 1.300 − 300 = Rp67.000", rows.total.includes("67.000"), rows.total);

    await page(`btn("Bayar", $('[data-testid="cart-panel"]'), "start")?.click(); return true;`);
    await waitFor(`!!$('[data-testid="payment-dialog"] #pay-amount')`);
    // Satu ketukan per event loop, seperti jari kasir: React merender ulang di antaranya.
    for (const k of ["7", "0", "000"]) {
      await page(`btn(${JSON.stringify(k)}, $('[aria-label="Numpad nominal"]'))?.click(); return true;`);
      await wait(80);
    }
    await wait(150);
    const padValue = await pageValue(`$('#pay-amount')?.value ?? null`);
    check("Numpad mengisi Rp70.000", padValue === "70.000", `Dapat: ${padValue}`);
    check("Kembalian Rp3.000", (await pageValue(`txt($('[data-testid="change-due"]'))`)).includes("3.000"));
    await waitFor(`(() => {
      const b = btn("Selesaikan", $('[data-testid="payment-dialog"]'), "start");
      if (!b || b.disabled) return false;
      b.click();
      return true;
    })()`);
    await waitFor(`!!$('[data-testid="receipt-preview"]')`);
    const receipt2 = await pageValue(`$('[data-testid="receipt-preview"]')?.textContent ?? ''`);
    check(
      "Struk memuat Diskon, Layanan, Pajak, Pembulatan",
      ["Diskon", "Layanan", "Pajak", "Pembulatan"].every((w) => receipt2.includes(w)),
    );
    check("Struk memuat TOTAL Rp67.000 dan kembalian Rp3.000", /TOTAL\s+Rp\s?67\.000/.test(receipt2) && /Kembalian\s+Rp\s?3\.000/.test(receipt2));
    await page(`btn("Selesai", $('[data-testid="receipt-preview"]')?.closest('[role="dialog"]'))?.click(); return true;`);
    await waitFor(`!$('[data-testid="receipt-preview"]')`);
    const secondOrder = await pageValue("storedOrders().find((o) => o.totalRp === 67000) ?? null");
    check(
      "Order kedua tersimpan dengan rincian diskon/pajak/layanan/pembulatan",
      secondOrder?.subtotalRp === 62000 &&
        secondOrder?.discountRp === 2000 &&
        secondOrder?.taxRp === 6000 &&
        secondOrder?.serviceChargeRp === 1300 &&
        secondOrder?.roundingRp === -300 &&
        secondOrder?.changeRp === 3000,
      JSON.stringify(secondOrder && {
        sub: secondOrder.subtotalRp,
        disc: secondOrder.discountRp,
        tax: secondOrder.taxRp,
        svc: secondOrder.serviceChargeRp,
        rnd: secondOrder.roundingRp,
        chg: secondOrder.changeRp,
      }),
    );
    check("Diskon & pajak direset setelah checkout", (await pageValue("summaryRow('Diskon') === null && summaryRow('Pajak') === null")));
    const toastErrorsCheckout = await errorToasts();
    check("Tidak ada toast error selama checkout", toastErrorsCheckout.length === 0, toastErrorsCheckout.join(" | "));

    // ------------------------------------------------------------------
    console.log("\n[TEST 6] Riwayat Transaksi & Keamanan PIN Void/Refund");
    await goTo("Riwayat");
    check("Halaman Riwayat terbuka", await waitFor("document.body.innerText.includes('Riwayat Order')"));
    const receiptOf = { "90.000": firstOrder?.receiptNumber, "67.000": secondOrder?.receiptNumber };
    const rowFor = (amount) =>
      `$$('[data-testid="order-row"]').find((r) => txt(r).includes(${JSON.stringify(receiptOf[amount] ?? "TIDAK-ADA")}) && txt(r).includes(${JSON.stringify(amount)}))`;
    check(
      "Order Rp90.000 tercatat di Riwayat dengan badge SELESAI",
      await waitFor(`(() => { const r = ${rowFor("90.000")}; return !!r && txt(r).includes('Selesai'); })()`),
    );
    check("Dua order tercatat di Riwayat", (await pageValue(`$$('[data-testid="order-row"]').length`)) === 2);

    await page(`btn("Void", ${rowFor("90.000")})?.click(); return true;`);
    check("Modal permintaan PIN terbuka saat klik Void", await waitFor(`!!$('#riwayat-void-pin')`));

    await enterPin("9999");
    check(
      "PIN salah ditolak dengan pesan error",
      await waitFor(`txt($('#riwayat-void-pin-msg')).includes('PIN salah')`, 15000),
    );
    check("Order tetap SELESAI setelah PIN salah", await pageValue(`storedOrders().find((o) => o.totalRp === 90000)?.status === 'completed'`));

    await enterPin("1234");
    check("Dialog PIN tertutup setelah PIN benar", await waitFor(`!$('#riwayat-void-pin')`, 15000));
    check(
      "Konfirmasi void (tindakan permanen) tampil",
      await waitFor(`txt($('[role="alertdialog"]')).includes('Void order')`),
    );
    await page(`btn("Void", $('[role="alertdialog"]'))?.click(); return true;`);
    check(
      "Status order berhasil diubah menjadi VOIDED setelah PIN benar",
      await waitFor(`storedOrders().find((o) => o.totalRp === 90000)?.status === 'voided'`),
    );
    check(
      "Badge Void tampil dan tombol Void/Refund hilang di baris order",
      await waitFor(`(() => { const r = ${rowFor("90.000")}; return !!r && !btn("Void", r) && !btn("Refund", r) && $$('span', r).some((s) => txt(s) === 'Void'); })()`),
    );

    await page(`btn("Refund", ${rowFor("67.000")})?.click(); return true;`);
    check("Modal PIN refund terbuka", await waitFor(`!!$('#riwayat-void-pin') && txt(topDialog()).includes('PIN refund')`));
    await enterPin("1234");
    await waitFor(`!$('#riwayat-void-pin')`, 15000);
    check("Konfirmasi refund tampil", await waitFor(`txt($('[role="alertdialog"]')).includes('Refund order')`));
    await page(`btn("Refund", $('[role="alertdialog"]'))?.click(); return true;`);
    check(
      "Status order Rp67.000 menjadi REFUNDED",
      await waitFor(`storedOrders().find((o) => o.totalRp === 67000)?.status === 'refunded'`),
    );

    const filterCount = async (label) => {
      await page(`$$('[data-testid="history-filter"]').find((c) => txt(c) === ${JSON.stringify(label)})?.click(); return true;`);
      await wait(250);
      return pageValue(`$$('[data-testid="order-row"]').length`);
    };
    check("Filter Void menampilkan 1 order", (await filterCount("Void")) === 1);
    check("Filter Refund menampilkan 1 order", (await filterCount("Refund")) === 1);
    check("Filter Selesai menampilkan 0 order", (await filterCount("Selesai")) === 0);
    check("Filter Semua menampilkan 2 order", (await filterCount("Semua")) === 2);

    // ------------------------------------------------------------------
    console.log("\n[TEST 7] Integritas Laporan & Pengecekan Error Console");
    await goTo("Laporan");
    check("Layar Laporan selesai dimuat (Lazy-loaded)", await waitFor(`!!$('[data-testid="trend-chart"]')`));
    check("Layar Laporan memuat 5 kartu KPI", (await pageValue(`$$('[data-testid="stat-card"]').length`)) === 5);
    check(
      "State tren kosong tampil benar setelah transaksi di-void (zero-sales state)",
      await pageValue(`txt($('[data-testid="trend-chart"]')).includes('Belum ada penjualan di rentang ini')`),
    );
    check(
      "Tombol periode laporan tidak tertimpa kolom tanggal",
      await pageValue(`(() => {
        const presets = $$('[aria-label="Periode laporan"] button');
        const dates = $$('#laporan-mulai, #laporan-selesai');
        return presets.length === 4 && presets.every((p) => p.getBoundingClientRect().width > 0 && dates.every((d) => !overlaps(p, d)));
      })()`),
    );
    const voidCard = await pageValue(`txt($$('[data-testid="stat-card"]').find((c) => txt(c).includes('Transaksi void')))`);
    check("Kartu void: 1 void Rp90.000, 1 refund Rp67.000", /Transaksi void\s*1(?!\d)/.test(voidCard) && voidCard.includes("90.000") && voidCard.includes("1 refund") && voidCard.includes("67.000"), voidCard);
    const omzetCard = await pageValue(`txt($$('[data-testid="stat-card"]').find((c) => txt(c).includes('Omzet')))`);
    check("Omzet Rp0 setelah void & refund", /Omzet\s*Rp0(?![\d.])/.test(omzetCard), omzetCard);

    // ------------------------------------------------------------------
    console.log("\n[TEST 8] Profil Toko: simpan di Pengaturan, bertahan setelah reload");
    await goTo("Setelan");
    await waitFor(`!!$('[data-testid="settings-tab-toko"]')`);
    await realClick(`$('[data-testid="settings-tab-toko"]')`);
    check("Layar Pengaturan terbuka dengan kolom profil toko", await waitFor(`!!$('#store-address') && $('#store-address').offsetParent !== null`));
    await page(`
      setValue($('#store-name'), 'Kedai Uji Profil');
      setValue($('#store-address'), 'Jl. Melati No. 7');
      setValue($('#store-receiptFooter'), 'Sampai jumpa');
      return true;
    `);
    await dismissToasts();
    await page(`$('[data-testid="settings-save"]').click(); return true;`);
    check("Pengaturan disimpan tanpa error", await waitFor("document.body.innerText.includes('Pengaturan disimpan.')"));
    check("Header memakai nama toko baru", await waitFor(`txt($('header p')).includes('Kedai Uji Profil')`));

    await reload();
    check("Nama toko baru bertahan setelah reload", await waitFor(`txt($('header p')).includes('Kedai Uji Profil')`, 10000));
    await goTo("Setelan");
    await waitFor(`!!$('#store-address')`);
    check("Alamat bertahan setelah reload", await waitFor(`$('#store-address')?.value === 'Jl. Melati No. 7'`, 10000));
    check("Teks bawah struk bertahan setelah reload", (await pageValue(`$('#store-receiptFooter')?.value`)) === "Sampai jumpa");
    await realClick(`$('[data-testid="settings-tab-kasir"]')`);
    await waitFor(`$('#service-charge')?.offsetParent !== null`);
    check(
      "Biaya layanan & pembulatan bertahan setelah reload",
      (await pageValue(`$('#service-charge').value === '1.300' && txt($('#rounding-step')).includes('Rp500')`)),
    );
    const toastErrorsSettings = await errorToasts();
    check("Tidak ada toast error di alur pengaturan", toastErrorsSettings.length === 0, toastErrorsSettings.join(" | "));

    // ------------------------------------------------------------------
    console.log("\n[TEST 9] Order cacat di localStorage tidak menjatuhkan aplikasi");
    await evalJs(`(() => {
      const key = "pos.orders.v1";
      const store = JSON.parse(localStorage.getItem(key) || '{"schemaVersion":1,"orders":[]}');
      store.orders.push({ id: "bad-no-payment", receiptNumber: "R-X", status: "completed", lines: [], createdAt: new Date().toISOString() });
      store.orders.push({ id: "bad-status", status: "weird" });
      localStorage.setItem(key, JSON.stringify(store));
    })()`);
    await reload();
    for (const view of ["Riwayat", "Laporan"]) {
      await goTo(view);
      await wait(700);
      check(`Layar ${view} tetap tampil (tanpa layar error)`, await pageValue("!document.body.innerText.includes('Aplikasi berhenti karena error')"));
    }
    check("Riwayat tetap memuat 2 order sah", await (async () => {
      await goTo("Riwayat");
      return waitFor(`$$('[data-testid="order-row"]').length === 2`);
    })());
    check("Order cacat dikarantina, bukan dibuang", await pageValue(`JSON.parse(localStorage.getItem("pos.orders.quarantine.v1") || "[]").length >= 2`));

    console.log("\n[TEST 10] Layout ponsel 390x844");
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await goTo("Kasir");
    // Banyak kategori membuat baris kategori lebih lebar dari layar ponsel.
    await evalJs(`(() => {
      const c = JSON.parse(localStorage.getItem("pos.catalog.v1"));
      for (const name of ["Slow Bar / V60", "Non-Coffee", "Pastry & Snack", "Musiman"]) {
        c.categories.push({ id: "cat-" + c.categories.length, name, sortOrder: c.categories.length });
      }
      localStorage.setItem("pos.catalog.v1", JSON.stringify(c));
      return true;
    })()`);
    await reload();
    await waitFor(`!!$('[data-testid="product-tile"]')`);
    check(
      "Katalog ponsel tidak lebih lebar dari layar (kolom pencarian & kartu terlihat utuh)",
      await pageValue(`(() => {
        const w = window.innerWidth + 1;
        const search = $('input[aria-label="Cari menu"]');
        return !!search && search.getBoundingClientRect().right <= w &&
          $$('[data-testid="product-tile"]').every((t) => t.getBoundingClientRect().right <= w);
      })()`),
    );

    const filteredErrors = consoleErrors.filter(
      (e) => !/favicon|net::ERR_|Failed to load resource/i.test(e),
    );
    check("NOL (0) Error di JavaScript Console selama seluruh alur", filteredErrors.length === 0, filteredErrors.slice(0, 5).join(" | "));
  } finally {
    try {
      ws?.close();
    } catch {
      // abaikan
    }
    browser?.kill("SIGKILL");
    preview.kill("SIGKILL");
    try {
      try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (e) {
      // Chromium can still hold files after SIGTERM. The run already has its result; warn only.
      console.warn(`peringatan: profil sementara tidak terhapus: ${e instanceof Error ? e.message : e}`);
    }
    } catch {
      // abaikan
    }
  }
}

// Penjaga terakhir: rejection yang lolos atau event loop yang kosong sebelum
// main() selesai tidak boleh berakhir dengan kode keluar 0.
let settled = false;
process.on("unhandledRejection", (e) => {
  console.error("E2E FATAL (unhandled rejection):", e);
  process.exit(1);
});
process.on("beforeExit", () => {
  if (!settled) {
    console.error("E2E FATAL: proses berhenti sebelum pengujian selesai.");
    process.exit(1);
  }
});

main()
  .then(() => {
    settled = true;
    const total = passed + failures.length;
    console.log(`\n==============================================`);
    console.log(
      `HASIL EXHAUSTIVE E2E: ${failures.length === 0 && total > 0 ? `SEMUA LULUS (${passed} pengujian)` : `${failures.length} GAGAL dari ${total}`}`,
    );
    console.log(`==============================================\n`);
    process.exit(failures.length === 0 && total > 0 ? 0 : 1);
  })
  .catch((e) => {
    settled = true;
    console.error("E2E FATAL:", e);
    if (failures.length) console.error(`(${failures.length} pengecekan sudah gagal sebelumnya)`);
    process.exit(1);
  });
