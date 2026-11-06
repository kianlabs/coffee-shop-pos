// Smoke test UI end-to-end tanpa dependency baru.
//
// Menjalankan `vite preview` dari hasil build, membuka Chromium headless lewat
// CDP, lalu menguji alur nyata di mode browser (localStorage): katalog -> keranjang
// -> bayar -> struk -> riwayat, plus layout di tablet dan ponsel.
//
// Pakai: `npm run build && npm run smoke:ui`
// Butuh Chromium/Chrome. Set CHROMIUM_BIN bila lokasinya tidak standar.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = Number(process.env.SMOKE_PORT || 4183);
const CDP_PORT = Number(process.env.SMOKE_CDP_PORT || 9413);
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
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
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
    } catch {
      // server belum siap
    }
    await wait(200);
  }
  return false;
}

async function main() {
  if (!existsSync(path.join(ROOT, "dist", "index.html"))) {
    throw new Error("dist/index.html belum ada. Jalankan `npm run build` dulu.");
  }
  const chromium = findChromium();
  if (!chromium) {
    console.log("SKIP: Chromium/Chrome tidak ditemukan. Set CHROMIUM_BIN untuk menjalankan smoke test.");
    return;
  }

  const profileDir = mkdtempSync(path.join(tmpdir(), "pos-smoke-"));
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
        "--disable-background-networking",
        "--disable-sync",
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
    const setViewport = (width, height, mobile) =>
      send(
        "Emulation.setDeviceMetricsOverride",
        { width, height, deviceScaleFactor: 1, mobile },
        sessionId,
      );
    const reload = async () => {
      await send("Page.reload", { ignoreCache: true }, sessionId);
      await waitFor("document.readyState === 'complete'");
      await wait(600);
    };

    console.log("\n[1] boot 1280x800");
    await setViewport(1280, 800, false);
    await send("Page.navigate", { url: URL }, sessionId);
    await waitFor("document.readyState === 'complete'");
    await wait(900);
    check("judul aplikasi", (await evalJs("document.title")) === "Kopi POS — Kasir");
    check("nav rail tampil", await evalJs("!!document.querySelector('.nav-rail')"));
    check("tidak ada overflow horizontal", await evalJs("document.documentElement.scrollWidth <= window.innerWidth + 1"));
    check("keranjang tampil", await evalJs("!!document.querySelector('.cart-panel')"));

    console.log("\n[2] katalog -> keranjang -> bayar -> struk");
    await evalJs(`(() => {
      localStorage.setItem("pos.orders.v1", JSON.stringify({ schemaVersion: 1, orders: [] }));
      localStorage.setItem("pos.catalog.v1", JSON.stringify({
        categories: [{ id: "cat-smoke", name: "Kopi", sortOrder: 0 }],
        products: [{
          id: "prod-smoke",
          categoryId: "cat-smoke",
          name: "Espresso Smoke",
          basePriceRp: 18000,
          isActive: true,
          variants: []
        }]
      }));
      return true;
    })()`);
    await reload();
    check("menu hasil seed tampil", await waitFor(`!!document.querySelector('[aria-label="Tambah Espresso Smoke"]')`));

    await evalJs(`document.querySelector('[aria-label="Tambah Espresso Smoke"]').click()`);
    check("item masuk keranjang", await waitFor(`!!document.querySelector('.cart-line')`));
    check(
      "total keranjang Rp18.000",
      (await evalJs(`document.querySelector('.cart-line-total')?.textContent || ''`)).includes("18.000"),
    );

    const payClicked = await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Bayar'));
      if (!btn || btn.disabled) return false;
      btn.click();
      return true;
    })()`);
    check("tombol bayar bisa ditekan", payClicked);
    check("struk muncul", await waitFor(`!!document.querySelector('.receipt-preview')`));
    const receipt = await evalJs(`document.querySelector('.receipt-preview')?.textContent || ''`);
    check("struk memuat menu", receipt.includes("Espresso Smoke"));
    check("struk memuat total", receipt.includes("18.000"));

    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Selesai');
      if (btn) btn.click();
      return true;
    })()`);
    check("modal struk tertutup", await waitFor(`!document.querySelector('.receipt-preview')`));

    console.log("\n[3] riwayat");
    await evalJs(`(() => {
      const nav = [...document.querySelectorAll('.nav-item')].find((b) => b.textContent.includes('Riwayat'));
      nav?.click();
      return !!nav;
    })()`);
    check("halaman riwayat terbuka", await waitFor(`document.body.innerText.includes('Riwayat Order')`));
    const storedOrder = await evalJs(
      `JSON.parse(localStorage.getItem('pos.orders.v1') || '{"orders":[]}').orders[0] || null`,
    );
    check("order tersimpan di riwayat", await waitFor(`document.body.innerText.includes(${JSON.stringify(storedOrder?.receiptNumber ?? "TIDAK-ADA")})`));
    check("satu order tersimpan", storedOrder !== null);
    const orderCount = await evalJs(`JSON.parse(localStorage.getItem('pos.orders.v1') || '{"orders":[]}').orders.length`);
    check("tidak ada order ganda", orderCount === 1, `dapat ${orderCount}`);
    check(
      "tombol refund tampil",
      await evalJs(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Refund'))`),
    );
    check(
      "tombol void tampil",
      await evalJs(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Void'))`),
    );
    check("filter refund ada di UI", await evalJs(`[...document.querySelectorAll('.chip')].some((c) => c.textContent.trim() === 'Refund')`));

    console.log("\n[4] laporan + grafik");
    await evalJs(`(() => {
      const nav = [...document.querySelectorAll('.nav-item')].find((b) => b.textContent.includes('Laporan'));
      nav?.click();
      return !!nav;
    })()`);
    check("halaman laporan terbuka", await waitFor(`document.body.innerText.includes('Tren omzet')`));
    check("grafik tren tampil", await evalJs(`!!document.querySelector('.trend-chart')`));
    check("lima kartu ringkasan", (await evalJs(`document.querySelectorAll('.stat-card').length`)) === 5);
    check("grafik hari ini 24 bucket", (await evalJs(`document.querySelectorAll('.trend-bar').length`)) === 24);
    check("bar metode bayar tampil", await evalJs(`!!document.querySelector('.payment-mix-bar')`));

    console.log("\n[5] layout 390x844");
    await setViewport(390, 844, true);
    await reload();
    check("nav bawah tampil", await evalJs("!!document.querySelector('.nav-rail')"));
    check("tidak ada overflow horizontal", await evalJs("document.documentElement.scrollWidth <= window.innerWidth + 1"));
    const navInfo = await evalJs(`(() => {
      const nav = document.querySelector('.nav-list');
      if (!nav) return null;
      const labels = [...nav.querySelectorAll('.nav-label')].map((el) => el.textContent.trim());
      const rail = document.querySelector('.nav-rail');
      return {
        labels,
        scrollable: nav.scrollWidth > nav.clientWidth + 1,
        hasEdgeFade: rail.className.includes('has-more'),
        width: nav.clientWidth,
        scrollWidth: nav.scrollWidth,
      };
    })()`);
    check("8 tujuan tersedia", navInfo?.labels.length === 8, JSON.stringify(navInfo?.labels));
    check(
      "nav bisa di-scroll",
      navInfo?.scrollable === true,
      `client=${navInfo?.width} scroll=${navInfo?.scrollWidth}`,
    );
    check("ada petunjuk tepi nav", navInfo?.hasEdgeFade === true);
    const activeVisible = await evalJs(`(() => {
      const active = document.querySelector('.nav-item[aria-current="page"]');
      if (!active) return false;
      const nav = document.querySelector('.nav-list');
      const a = active.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      return a.left >= n.left - 1 && a.right <= n.right + 1;
    })()`);
    check("item aktif terlihat", activeVisible);

    const realErrors = consoleErrors.filter(
      (e) => !/favicon|net::ERR_|Failed to load resource/i.test(e),
    );
    check("tidak ada error console", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
  } finally {
    try {
      ws?.close();
    } catch {
      // abaikan
    }
    browser?.kill("SIGTERM");
    preview.kill("SIGTERM");
    rmSync(profileDir, { recursive: true, force: true });
  }
}

main()
  .then(() => {
    console.log(
      `\n=== ${failures.length === 0 ? `SMOKE LULUS (${passed})` : `${failures.length} GAGAL dari ${passed + failures.length}`} ===`,
    );
    process.exit(failures.length === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error(`\nSMOKE ERROR: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
