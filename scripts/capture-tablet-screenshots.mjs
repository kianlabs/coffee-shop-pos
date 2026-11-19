// Screenshot dokumentasi dari UI nyata (vite preview + Chromium headless via CDP).
//
// Pakai: `npm run build && node scripts/capture-tablet-screenshots.mjs [--out <dir>]`
// Folder output: --out <dir>, atau env SCREENSHOT_DIR, bawaan docs/screenshots.
// Butuh Chromium/Chrome. Set CHROMIUM_BIN bila lokasinya tidak standar.
import { spawn, spawnSync } from "node:child_process";
import WebSocket from "ws";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function outDirFromArgs(argv) {
  const i = argv.findIndex((a) => a === "--out" || a.startsWith("--out="));
  if (i === -1) return process.env.SCREENSHOT_DIR || path.join(ROOT, "docs/screenshots");
  const value = argv[i].includes("=") ? argv[i].slice("--out=".length) : argv[i + 1];
  if (!value) throw new Error("--out butuh nama folder.");
  return value;
}

const OUT_DIR = path.resolve(outDirFromArgs(process.argv.slice(2)));
const PORT = Number(process.env.SCREENSHOT_PORT || 4199);
const CDP_PORT = Number(process.env.SCREENSHOT_CDP_PORT || 9433);
const URL = `http://localhost:${PORT}/`;
const TABLET = { width: 1280, height: 800, deviceScaleFactor: 1.5, mobile: false };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };

const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_BIN,
  "chromium",
  "chromium-browser",
  "google-chrome",
  "google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/sbin/chromium",
].filter(Boolean);

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

const PAGE_HELPERS = `
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const txt = (el) => (el?.textContent ?? "").replace(/\\s+/g, " ").trim();
  const btn = (label, scope = document, mode = "exact") =>
    $$("button", scope).find((b) => (mode === "exact" ? txt(b) === label : txt(b).startsWith(label)));
  const nav = (label) => $$('[data-testid="nav-item"]').find((b) => txt(b) === label);
`;

function seedScript(logoBase64) {
  return `(() => {
    localStorage.clear();
    localStorage.setItem("pos.settings.v1", JSON.stringify({
      storeName: "KEDAI CONTOH",
      roundingStep: 0,
      serviceChargeRp: 0,
      cashierName: "Kian",
      autoPrint: false,
      printLogo: true,
      logoBase64: ${JSON.stringify(logoBase64)},
      requireVoidPin: false,
      showCashNumpad: true
    }));
    localStorage.setItem("pos.store-profile.v1", JSON.stringify({
      name: "KEDAI CONTOH",
      address: "Jl. Moh. Yamin No.84A, Kawatan, Serengan, Surakarta",
      npwp: "",
      receiptHeader: "",
      receiptFooter: "Matur nuwun sampun rawuh!",
      logoB64: ${JSON.stringify(logoBase64)}
    }));

    const now = new Date();
    localStorage.setItem("pos.shift.v1", JSON.stringify({
      id: "shift-demo-01",
      cashierName: "Kian",
      openedAt: new Date(now.getTime() - 4 * 3600000).toISOString(),
      closedAt: null,
      openCashRp: 200000
    }));

    const categories = [
      { id: "cat-sig", name: "Signature 08.20", sortOrder: 0 },
      { id: "cat-slow", name: "Slow Bar / V60", sortOrder: 1 },
      { id: "cat-esp", name: "Espresso Based", sortOrder: 2 },
      { id: "cat-non", name: "Non-Coffee", sortOrder: 3 },
      { id: "cat-snack", name: "Pastry & Snack", sortOrder: 4 }
    ];
    const p = (id, categoryId, name, basePriceRp, variants = []) =>
      ({ id, categoryId, name, basePriceRp, isActive: true, variants: variants.map((v) => ({ ...v, productId: id, isActive: true })) });
    const products = [
      p("prod-escobar", "cat-sig", "08.20 Escobar", 38000, [
        { id: "var-esc-reg", name: "Regular", priceDeltaRp: 0 },
        { id: "var-esc-lg", name: "Large", priceDeltaRp: 4000 }
      ]),
      p("prod-butterscotch", "cat-sig", "08.20 Butterscotch", 38000),
      p("prod-nightfury", "cat-sig", "Night Fury Cold Press", 36000),
      p("prod-kopsus", "cat-sig", "Es Kopi Aren", 24000),
      p("prod-choc", "cat-non", "Chocolate Paddle", 35000),
      p("prod-v60", "cat-slow", "V60 Gayo Anaerob", 32000),
      p("prod-croissant", "cat-snack", "Almond Butter Croissant", 28000),
      p("prod-americano", "cat-esp", "Americano Classic", 22000, [
        { id: "var-ame-hot", name: "Hot", priceDeltaRp: 0 },
        { id: "var-ame-ice", name: "Iced", priceDeltaRp: 2000 }
      ])
    ];
    localStorage.setItem("pos.catalog.v1", JSON.stringify({ categories, products }));

    const line = (productId, productName, unitPriceRp, qty, hppTotal, variantId = null, variantName = null) => ({
      productId, variantId, productName, variantName, unitPriceRp, qty,
      lineTotalRp: unitPriceRp * qty, discountRp: 0, netTotalRp: unitPriceRp * qty, hppTotal
    });
    const order = (n, minutesAgo, lines, paid, method = "cash") => {
      const total = lines.reduce((s, l) => s + l.lineTotalRp, 0);
      const at = new Date(now.getTime() - minutesAgo * 60000).toISOString();
      return {
        id: "ord-demo-" + n,
        receiptNumber: "R-DEMO-" + String(n).padStart(4, "0"),
        createdAt: at,
        cashierName: "Kian",
        subtotalRp: total, discountRp: 0, taxRp: 0, serviceChargeRp: 0, roundingRp: 0, totalRp: total,
        idempotencyKey: "seed-" + n,
        payment: { method, amountRp: method === "cash" ? paid : total, paidAt: at },
        changeRp: method === "cash" ? paid - total : 0,
        status: "completed",
        notes: "[Dine In]",
        lines
      };
    };
    const orders = [
      order(3, 45, [line("prod-v60", "V60 Gayo Anaerob", 32000, 1, 11000), line("prod-croissant", "Almond Butter Croissant", 28000, 1, 14000)], 100000),
      order(2, 130, [line("prod-escobar", "08.20 Escobar", 42000, 2, 30000, "var-esc-lg", "Large")], 84000, "qris_manual"),
      order(1, 200, [line("prod-kopsus", "Es Kopi Aren", 24000, 3, 27000)], 100000)
    ];
    localStorage.setItem("pos.orders.v1", JSON.stringify({ schemaVersion: 1, orders }));

    localStorage.setItem("pos.cart.v1", JSON.stringify([
      { productId: "prod-escobar", variantId: "var-esc-reg", productName: "08.20 Escobar", variantName: "Regular", unitPriceRp: 38000, qty: 1 },
      { productId: "prod-kopsus", variantId: null, productName: "Es Kopi Aren", variantName: null, unitPriceRp: 24000, qty: 2 }
    ]));
    return true;
  })()`;
}

async function main() {
  if (!existsSync(path.join(ROOT, "dist", "index.html"))) {
    throw new Error("dist/index.html belum ada. Jalankan `npm run build` dulu.");
  }
  const chromium = findChromium();
  if (!chromium) throw new Error("Chromium tidak ditemukan. Set CHROMIUM_BIN.");
  mkdirSync(OUT_DIR, { recursive: true });

  const profileDir = mkdtempSync(path.join(tmpdir(), "pos-ss-"));
  const preview = spawn(
    process.execPath,
    [path.join(ROOT, "node_modules/vite/bin/vite.js"), "preview", "--port", String(PORT), "--strictPort"],
    { cwd: ROOT, stdio: "ignore" },
  );
  let browser;
  let ws;
  try {
    if (!(await waitForHttp(URL))) throw new Error(`Preview tidak merespons di ${URL}`);
    browser = spawn(
      chromium,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-extensions",
        "--disable-dev-shm-usage",
        "--hide-scrollbars",
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
    const send = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const i = ++id;
        pending.set(i, { resolve, reject });
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

    const evalJs = async (expression) => {
      const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
      return res.result?.value;
    };
    const page = (body) => evalJs(`(async () => { ${PAGE_HELPERS}\n${body}\n})()`);
    /** Menunggu ekspresi bernilai benar; gagal keras agar tidak memotret layar yang salah. */
    const expectUi = async (expr, what, timeoutMs = 8000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await page(`return (${expr});`)) return;
        await wait(100);
      }
      throw new Error(`UI tidak siap: ${what}`);
    };
    const click = async (expr, what) => {
      const ok = await page(`const el = (${expr}); if (!el || el.disabled) return false; el.click(); return true;`);
      if (!ok) throw new Error(`Tidak bisa menekan: ${what}`);
    };
    const goTo = async (label, readyExpr) => {
      await click(`nav(${JSON.stringify(label)})`, `navigasi ${label}`);
      await expectUi(readyExpr, `layar ${label}`);
      await wait(500);
    };
    const dismissToasts = async () => {
      await page(`$$('[data-sonner-toast] [data-close-button]').forEach((b) => b.click()); return true;`);
      await wait(300);
    };
    const reload = async () => {
      await send("Page.reload", { ignoreCache: true }, sessionId);
      await expectUi("document.readyState === 'complete'", "halaman dimuat");
      await wait(800);
    };
    const shot = async (name) => {
      // Tunggu animasi dialog/sheet (≈200 ms) selesai sebelum memotret.
      await wait(400);
      const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
      const file = path.join(OUT_DIR, name);
      writeFileSync(file, Buffer.from(data, "base64"));
      console.log(`Tersimpan: ${file}`);
    };

    const logoFile = path.join(ROOT, "public/logo.png");
    const logoBase64 = existsSync(logoFile) ? `data:image/png;base64,${readFileSync(logoFile).toString("base64")}` : "";

    await send("Emulation.setDeviceMetricsOverride", TABLET, sessionId);
    await send("Page.navigate", { url: URL }, sessionId);
    await expectUi("document.readyState === 'complete'", "halaman dimuat");
    await evalJs(seedScript(logoBase64));
    await reload();

    // 1. Kasir dengan isi keranjang
    await expectUi(`$$('[data-testid="cart-line"]').length === 2`, "keranjang berisi 2 baris");
    await shot("tablet-kasir.png");

    // 2. Dialog pembayaran (tunai, nominal cepat Rp100.000)
    await click(`btn("Bayar", $('[data-testid="cart-panel"]'), "start")`, "Bayar");
    await expectUi(`!!$('[data-testid="payment-dialog"]')`, "dialog pembayaran");
    await click(`$$('[aria-label="Nominal cepat"] button').find((b) => txt(b) === 'Rp100.000')`, "nominal Rp100.000");
    await expectUi(`txt($('[data-testid="change-due"]')).includes('Kembalian')`, "kembalian");
    await shot("tablet-bayar.png");

    // 3. Dialog struk setelah pembayaran
    await click(`btn("Selesaikan", $('[data-testid="payment-dialog"]'), "start")`, "Selesaikan");
    await expectUi(`!!$('[data-testid="receipt-preview"]') && !$('[data-testid="payment-dialog"]')`, "dialog struk");
    await dismissToasts();
    await shot("tablet-struk.png");
    await click(`btn("Selesai", $('[data-testid="receipt-preview"]').closest('[role="dialog"]'))`, "Selesai");
    await expectUi(`!$('[data-testid="receipt-preview"]')`, "dialog struk tertutup");

    // 4. Laporan
    await goTo("Laporan", `$$('[data-testid="stat-card"]').length === 5 && !!$('[data-testid="payment-mix-bar"]')`);
    await dismissToasts();
    await shot("tablet-laporan.png");

    // 5. Pengaturan (tab Toko)
    await goTo("Setelan", `!!$('#store-name') && $('#store-name').value === 'KEDAI CONTOH'`);
    await dismissToasts();
    await shot("tablet-pengaturan.png");

    // 6. Riwayat
    await goTo("Riwayat", `$$('[data-testid="order-row"]').length === 4`);
    await dismissToasts();
    await shot("tablet-riwayat.png");

    // 7. Menu & Harga
    await goTo("Menu", `$$('[data-testid="menu-product-row"]').length > 0`);
    await dismissToasts();
    await shot("tablet-menu.png");

    // 8. Ponsel: kasir dengan bar keranjang
    await goTo("Kasir", `!!$('[data-testid="product-tile"]')`);
    await send("Emulation.setDeviceMetricsOverride", PHONE, sessionId);
    await reload();
    await click(`$('[aria-label="Tambah Es Kopi Aren"]')`, "Tambah Es Kopi Aren");
    await wait(100);
    await click(`$('[aria-label="Tambah 08.20 Butterscotch"]')`, "Tambah 08.20 Butterscotch");
    await expectUi(`!!$('[data-testid="cart-bar"]') && !!$('[data-testid="mobile-nav"]')`, "bar keranjang ponsel");
    await shot("phone-kasir.png");
    console.log("Semua screenshot berhasil diambil!");
  } finally {
    try {
      ws?.close();
    } catch {
      // abaikan
    }
    browser?.kill("SIGKILL");
    preview.kill("SIGKILL");
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // abaikan
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Gagal capture:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
