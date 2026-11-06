import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = "/home/kian/.gemini/antigravity/brain/0e56c69c-844f-43dc-a905-95a6dac8d27f";
const PORT = 4199;
const CDP_PORT = 9433;
const URL = `http://localhost:${PORT}/`;

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

async function waitForHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await wait(200);
  }
  return false;
}

async function main() {
  const chromium = findChromium();
  if (!chromium) throw new Error("Chromium tidak ditemukan.");

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
      const res = await send(
        "Runtime.evaluate",
        { expression, returnByValue: true, awaitPromise: true },
        sessionId,
      );
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
      return res.result?.value;
    };

    const waitFor = async (expression, timeoutMs = 8000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await evalJs(expression)) return true;
        await wait(100);
      }
      return false;
    };

    // Set Tablet Viewport: 1280 x 800 Landscape (DPR: 1.5 untuk gambar tajam)
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1280, height: 800, deviceScaleFactor: 1.5, mobile: false },
      sessionId,
    );

    // Ambil logo base64 jika ada
    let logoBase64 = "";
    const logoFile = path.join(ROOT, "public/logo.png");
    if (existsSync(logoFile)) {
      logoBase64 = `data:image/png;base64,${readFileSync(logoFile).toString("base64")}`;
    }

    await send("Page.navigate", { url: URL }, sessionId);
    await waitFor("document.readyState === 'complete'");
    await wait(600);

    // Seed Data Rahardjo Coffee Surakarta
    await evalJs(`(() => {
      const settings = {
        storeName: "RAHARDJO COFFEE",
        address: "Jl. Moh. Yamin No.84A, Kawatan, Serengan, Surakarta",
        phone: "0812-2888-0820",
        footerMessage: "Matur nuwun sampun rawuh!\\nNikmati slow-bar & kopi hangat di Kawatan Solo.",
        paperWidth: 58,
        taxPercent: 0,
        servicePercent: 0,
        roundingStep: 0,
        cashierName: "Kian",
        autoPrint: true,
        printLogo: true,
        logoBase64: ${JSON.stringify(logoBase64)},
        voidPinHash: null,
        voidPinSalt: null
      };
      localStorage.setItem("pos.settings.v1", JSON.stringify(settings));

      const now = new Date();
      const shift = {
        id: "shift-demo-01",
        cashierName: "Kian",
        openedAt: new Date(now.getTime() - 4 * 3600000).toISOString(),
        closedAt: null,
        openCashRp: 200000
      };
      localStorage.setItem("pos.shift.v1", JSON.stringify(shift));

      const categories = [
        { id: "cat-sig", name: "Signature 08.20", sortOrder: 0 },
        { id: "cat-slow", name: "Slow Bar / V60", sortOrder: 1 },
        { id: "cat-esp", name: "Espresso Based", sortOrder: 2 },
        { id: "cat-non", name: "Non-Coffee", sortOrder: 3 },
        { id: "cat-snack", name: "Pastry & Snack", sortOrder: 4 }
      ];

      const products = [
        {
          id: "prod-escobar",
          categoryId: "cat-sig",
          name: "08.20 Escobar",
          basePriceRp: 38000,
          isActive: true,
          variants: [
            { id: "var-esc-reg", productId: "prod-escobar", name: "Regular", priceDeltaRp: 0, isActive: true },
            { id: "var-esc-lg", productId: "prod-escobar", name: "Large", priceDeltaRp: 4000, isActive: true }
          ]
        },
        {
          id: "prod-butterscotch",
          categoryId: "cat-sig",
          name: "08.20 Butterscotch",
          basePriceRp: 38000,
          isActive: true,
          variants: []
        },
        {
          id: "prod-choc",
          categoryId: "cat-non",
          name: "Chocolate Paddle",
          basePriceRp: 35000,
          isActive: true,
          variants: []
        },
        {
          id: "prod-v60",
          categoryId: "cat-slow",
          name: "V60 Gayo Anaerob",
          basePriceRp: 32000,
          isActive: true,
          variants: []
        },
        {
          id: "prod-kopsus",
          categoryId: "cat-esp",
          name: "Es Kopi Rahardjo (Aren)",
          basePriceRp: 24000,
          isActive: true,
          variants: []
        },
        {
          id: "prod-croissant",
          categoryId: "cat-snack",
          name: "Almond Butter Croissant",
          basePriceRp: 28000,
          isActive: true,
          variants: []
        },
        {
          id: "prod-americano",
          categoryId: "cat-esp",
          name: "Americano Classic",
          basePriceRp: 22000,
          isActive: true,
          variants: [
            { id: "var-ame-hot", productId: "prod-americano", name: "Hot", priceDeltaRp: 0, isActive: true },
            { id: "var-ame-ice", productId: "prod-americano", name: "Iced", priceDeltaRp: 2000, isActive: true }
          ]
        },
        {
          id: "prod-nightfury",
          categoryId: "cat-sig",
          name: "Night Fury Cold Press",
          basePriceRp: 36000,
          isActive: true,
          variants: []
        }
      ];
      localStorage.setItem("pos.catalog.v1", JSON.stringify({ categories, products }));

      // Seed 1 order di riwayat
      const orders = [
        {
          id: "ord-prev-1",
          receiptNumber: "R-20261106-0017",
          createdAt: new Date(now.getTime() - 45 * 60000).toISOString(),
          cashierName: "Kian",
          subtotalRp: 60000,
          discountRp: 0,
          taxRp: 0,
          serviceChargeRp: 0,
          roundingRp: 0,
          totalRp: 60000,
          payMethod: "cash",
          paidAmountRp: 100000,
          changeRp: 40000,
          status: "completed",
          notes: "",
          lines: [
            { productId: "prod-v60", variantId: null, productName: "V60 Gayo Anaerob", variantName: null, unitPriceRp: 32000, qty: 1, lineTotalRp: 32000, hppUnitSnapshotRp: 11000 },
            { productId: "prod-croissant", variantId: null, productName: "Almond Butter Croissant", variantName: null, unitPriceRp: 28000, qty: 1, lineTotalRp: 28000, hppUnitSnapshotRp: 14000 }
          ]
        }
      ];
      localStorage.setItem("pos.orders.v1", JSON.stringify({ schemaVersion: 1, orders }));

      // Keranjang aktif
      const cart = [
        { productId: "prod-escobar", variantId: "var-esc-reg", productName: "08.20 Escobar", variantName: "Regular", unitPriceRp: 38000, qty: 1 },
        { productId: "prod-kopsus", variantId: null, productName: "Es Kopi Rahardjo (Aren)", variantName: null, unitPriceRp: 24000, qty: 2 }
      ];
      localStorage.setItem("pos.cart.v1", JSON.stringify(cart));
      return true;
    })()`);

    // Reload halaman dengan data baru
    await send("Page.reload", { ignoreCache: true }, sessionId);
    await waitFor("document.readyState === 'complete'");
    await wait(1000);

    // 1. Tangkap Screenshot Layar Kasir Tablet
    console.log("Mengambil screenshot 1: Layar Kasir Tablet...");
    const ss1 = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(path.join(OUT_DIR, "tablet-kasir.png"), Buffer.from(ss1.data, "base64"));
    console.log("Tersimpan: tablet-kasir.png");

    // 2. Klik Bayar untuk membuka Modal Struk
    console.log("Membuka Modal Struk...");
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Bayar Rp86.000') || b.textContent.includes('Bayar'));
      if (btn) btn.click();
    })()`);
    await waitFor("!!document.querySelector('.receipt-preview')");
    // Buka details preview struk
    await evalJs(`(() => {
      const details = document.querySelector('details.cart-extra');
      if (details) details.open = true;
    })()`);
    await wait(500);

    console.log("Mengambil screenshot 2: Modal Struk Pembayaran dengan Logo...");
    const ss2 = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(path.join(OUT_DIR, "tablet-struk.png"), Buffer.from(ss2.data, "base64"));
    console.log("Tersimpan: tablet-struk.png");

    // Tutup modal struk
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Selesai');
      if (btn) btn.click();
    })()`);
    await wait(400);

    // 3. Pindah ke Layar Laporan
    console.log("Pindah ke Layar Laporan...");
    await evalJs(`(() => {
      const nav = [...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Laporan'));
      if (nav) nav.click();
    })()`);
    await waitFor("document.body.innerText.includes('Laporan Penjualan')");
    await wait(800);

    console.log("Mengambil screenshot 3: Dashboard Laporan...");
    const ss3 = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(path.join(OUT_DIR, "tablet-laporan.png"), Buffer.from(ss3.data, "base64"));
    console.log("Tersimpan: tablet-laporan.png");

    console.log("Semua screenshot berhasil diambil!");
  } finally {
    if (ws) ws.close();
    if (browser) browser.kill("SIGKILL");
    if (preview) preview.kill("SIGKILL");
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error("Gagal capture:", err);
  process.exit(1);
});
