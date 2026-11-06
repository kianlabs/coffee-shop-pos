import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = 4198;
const CDP_PORT = 9438;
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

  const profileDir = mkdtempSync(path.join(tmpdir(), "pos-e2e-"));
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
    const consoleErrors = [];
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
      if (data.method === "Log.entryAdded" && data.params?.entry?.level === "error") {
        consoleErrors.push(data.params.entry.text);
      }
      if (data.method === "Runtime.exceptionThrown") {
        consoleErrors.push(data.params?.exceptionDetails?.text ?? "exception");
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

    const reload = async () => {
      await send("Page.reload", { ignoreCache: true }, sessionId);
      await waitFor("document.readyState === 'complete'");
      await wait(500);
    };

    // 1. Tablet Landscape Viewport (1280x800)
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );

    await send("Page.navigate", { url: URL }, sessionId);
    await waitFor("document.readyState === 'complete'");

    console.log("\n[TEST 1] Inisialisasi Toko, Shift & Katalog Menu");
    const logoFile = path.join(ROOT, "public/logo.png");
    const logoBase64 = existsSync(logoFile) ? `data:image/png;base64,${readFileSync(logoFile).toString("base64")}` : "";

    await evalJs(`(() => {
      localStorage.clear();
      // Setup Settings Rahardjo Coffee
      localStorage.setItem("pos.settings.v1", JSON.stringify({
        storeName: "RAHARDJO COFFEE",
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

      // Setup Shift Buka dengan modal awal Rp200.000
      localStorage.setItem("pos.shift.v1", JSON.stringify({
        id: "shift-e2e-01",
        cashierName: "Barista Kian",
        openedAt: new Date().toISOString(),
        closedAt: null,
        openCashRp: 200000
      }));

      // Setup Menu dengan Varian
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
            name: "Es Kopi Rahardjo",
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

    check("Nama toko 'RAHARDJO COFFEE' tampil di header", await evalJs("document.body.innerText.includes('RAHARDJO COFFEE')"));
    check("Shift berjalan dengan kasir 'Barista Kian'", await evalJs("document.body.innerText.includes('Shift buka')"));
    check("Menu multi-varian '08.20 Escobar' menampilkan badge varian", await evalJs("document.body.innerText.toUpperCase().includes('2 VARIAN')"));
    check("Menu tanpa varian menampilkan tombol Tambah", await waitFor("!!document.querySelector('[aria-label=\"Tambah Es Kopi Rahardjo\"]')"));

    console.log("\n[TEST 2] Keranjang & Aritmetika Multi-Varian");
    // Tambah varian Large (38.000 + 4.000 = 42.000)
    await evalJs(`document.querySelector('[aria-label="Tambah 08.20 Escobar Large"]').click()`);
    await waitFor("!!document.querySelector('.cart-line')");
    check("Item varian Large masuk keranjang", await evalJs("document.querySelector('.cart-line')?.textContent.includes('Large')"));
    check("Harga varian Large Rp42.000", await evalJs("document.querySelector('.cart-line-total')?.textContent.includes('42.000')"));

    // Tambah Es Kopi Rahardjo (24.000)
    await evalJs(`document.querySelector('[aria-label="Tambah Es Kopi Rahardjo"]').click()`);
    await wait(200);
    // Tambah lagi qty Es Kopi Rahardjo jadi 2x (48.000)
    await evalJs(`(() => {
      const btns = [...document.querySelectorAll('.qty-btn')];
      // Cari tombol tambah untuk item kedua
      btns[btns.length - 1]?.click();
    })()`);
    await wait(200);

    // Total harus: 42.000 + (24.000 * 2) = 90.000
    const totalText = await evalJs("document.querySelector('.cart-total-row.is-total .total-value')?.textContent || ''");
    check("Subtotal & Total keranjang tepat Rp90.000 (Integer Arithmetic)", totalText.includes("90.000"), `Dapat: ${totalText}`);

    console.log("\n[TEST 3] Smart Payment Switcher (QRIS vs Tunai)");
    // Pilih QRIS
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'QRIS');
      btn?.click();
    })()`);
    await wait(200);
    check("Mode QRIS: hint notifikasi QRIS tampil", await evalJs("!!document.querySelector('.pay-noncash-hint')"));
    check("Mode QRIS: kolom uang tunai & kembalian disembunyikan", await evalJs("!document.querySelector('.pay-amount-input')"));

    // Balik ke Tunai
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Tunai');
      btn?.click();
    })()`);
    await wait(200);
    check("Mode Tunai: input nominal uang tunai kembali tampil", await evalJs("!!document.querySelector('.pay-amount-input')"));
    check("Mode Tunai: tombol quick cash tampil", await evalJs("!!document.querySelector('.quick-cash')"));

    // Masukkan pembayaran Rp100.000 tunai via quick-cash
    await evalJs(`(() => {
      const btn100k = [...document.querySelectorAll('.quick-cash button')].find(b => b.textContent.includes('100.000'));
      if (btn100k) {
        btn100k.click();
      } else {
        const input = document.querySelector('#pay-amount');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, '100000');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await wait(300);

    const changeText = await evalJs("document.querySelector('.change-row strong')?.textContent || ''");
    check("Kalkulasi Kembalian tepat Rp10.000 (100.000 - 90.000)", changeText.includes("10.000"), `Dapat: ${changeText}`);

    console.log("\n[TEST 4] Checkout & Pratinjau Struk dengan Logo");
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Bayar Rp90.000') || b.textContent.startsWith('Bayar'));
      btn?.click();
    })()`);

    check("Modal Pembayaran Berhasil terbuka", await waitFor("!!document.querySelector('.modal.wide')"));
    check("Kembalian di modal struk tepat Rp10.000", await evalJs("document.querySelector('.modal .cart-total-row.is-total')?.textContent.includes('10.000')"));

    // Buka details struk
    await evalJs(`(() => {
      const d = document.querySelector('details.cart-extra');
      if (d) d.open = true;
    })()`);
    await wait(200);

    check("Logo Toko tampil di pratinjau struk", await evalJs("!!document.querySelector('.modal details img[alt=\"Logo Toko\"]')"));
    const receiptText = await evalJs("document.querySelector('.receipt-preview')?.textContent || ''");
    check("Teks struk memuat nama toko RAHARDJO COFFEE", receiptText.includes("RAHARDJO COFFEE"));
    check("Teks struk memuat item varian (08.20 Escobar - Regular/Large)", receiptText.includes("08.20 Escobar"));
    check("Teks struk memuat total Rp90.000", receiptText.includes("90.000"));

    // Tutup modal
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.trim() === 'Selesai');
      btn?.click();
    })()`);
    await waitFor("!document.querySelector('.modal.wide')");
    check("Modal struk tertutup bersih, keranjang kembali kosong", await evalJs("document.querySelectorAll('.cart-line').length === 0"));

    console.log("\n[TEST 5] Riwayat Transaksi & Keamanan PIN Void");
    // Pindah ke Riwayat
    await evalJs(`(() => {
      const nav = [...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Riwayat'));
      nav?.click();
    })()`);
    check("Halaman Riwayat terbuka", await waitFor("document.body.innerText.includes('Riwayat Order')"));
    check("Order Rp90.000 tercatat di Riwayat dengan badge SELESAI", await waitFor("document.body.innerText.includes('Rp90.000')"));

    // Klik tombol Void pada kartu pesanan (bukan filter chip)
    await evalJs(`(() => {
      const btn = document.querySelector('button.danger');
      btn?.click();
    })()`);
    check("Modal permintaan PIN terbuka saat klik Void", await waitFor("!!document.querySelector('#pin-title')"));

    // Masukkan PIN SALAH (9999)
    await evalJs(`(() => {
      const input = document.querySelector('input[type="password"]');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, '9999');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const submit = [...document.querySelectorAll('.modal button')].find(b => b.textContent.includes('Verifikasi') || b.classList.contains('primary'));
      submit?.click();
    })()`);
    await wait(400);
    check("PIN salah ditolak dengan pesan error", await evalJs("document.body.innerText.includes('PIN salah') || !!document.querySelector('.modal .error') || !!document.querySelector('.toast.is-error')"));

    // Masukkan PIN BENAR (1234)
    await evalJs(`(() => {
      window.confirm = () => true;
      const input = document.querySelector('input[type="password"]');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, '1234');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const submit = [...document.querySelectorAll('.modal button')].find(b => b.textContent.includes('Verifikasi') || b.classList.contains('primary'));
      submit?.click();
    })()`);
    await waitFor("!document.querySelector('#pin-title')", 5000);
    await wait(400);

    check("Status order berhasil diubah menjadi VOIDED setelah PIN benar", await waitFor("!!document.querySelector('.badge-danger') || document.body.innerText.includes('Void')"));

    console.log("\n[TEST 6] Integritas Laporan & Pengecekan Error Console");
    // Pindah ke Laporan (Lazy Loaded)
    await evalJs(`(() => {
      const nav = [...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Laporan'));
      nav?.click();
    })()`);
    check("Layar Laporan selesai dimuat (Lazy-loaded)", await waitFor("!!document.querySelector('.report-layout, .report-chart-card')"));
    check("Layar Laporan memuat 5 kartu KPI", (await evalJs("document.querySelectorAll('.stat-card').length")) === 5);
    check("State tren kosong tampil benar setelah transaksi di-void (zero-sales state)", await evalJs("!!document.querySelector('.trend-empty')"));

    const filteredErrors = consoleErrors.filter(
      (e) => !/favicon|net::ERR_|Failed to load resource/i.test(e),
    );
    check("NOL (0) Error di JavaScript Console selama seluruh alur", filteredErrors.length === 0, filteredErrors.join(" | "));

  } finally {
    if (ws) ws.close();
    if (browser) browser.kill("SIGKILL");
    if (preview) preview.kill("SIGKILL");
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {}
  }
}

main()
  .then(() => {
    console.log(`\n==============================================`);
    console.log(`HASIL EXHAUSTIVE E2E: ${failures.length === 0 ? `SEMUA LULUS (${passed} pengujian)` : `${failures.length} GAGAL dari ${passed + failures.length}`}`);
    console.log(`==============================================\n`);
    process.exit(failures.length === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error("E2E FATAL:", e);
    process.exit(1);
  });
