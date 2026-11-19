// Test domain tanpa dependency tambahan: compile TypeScript lalu jalankan
// assertion di Node. Dipakai `npm test`.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = mkdtempSync(path.join(tmpdir(), "pos-test-"));

execFileSync(
  path.join(ROOT, "node_modules/.bin/tsc"),
  [
    "src/domain/money.ts",
    "src/domain/orders.ts",
    "src/domain/hpp.ts",
    "src/domain/hppResolve.ts",
    "src/domain/shifts.ts",
    "src/domain/sales.ts",
    "src/domain/units.ts",
    "src/domain/recipe.ts",
    "src/domain/semver.ts",
    "src/domain/storeProfile.ts",
    "src/data/orderStore.ts",
    "src/data/settings.ts",
    "src/data/receipt.ts",
    "--ignoreConfig",
    "--outDir",
    OUT,
    "--module",
    "commonjs",
    "--target",
    "es2020",
    "--skipLibCheck",
  ],
  { cwd: ROOT, stdio: "inherit" },
);

const require = createRequire(import.meta.url);
const money = require(path.join(OUT, "domain/money.js"));
const orders = require(path.join(OUT, "domain/orders.js"));
const hpp = require(path.join(OUT, "domain/hpp.js"));
const resolve = require(path.join(OUT, "domain/hppResolve.js"));
const shifts = require(path.join(OUT, "domain/shifts.js"));
const settings = require(path.join(OUT, "data/settings.js"));
const sales = require(path.join(OUT, "domain/sales.js"));
const units = require(path.join(OUT, "domain/units.js"));
const recipeDomain = require(path.join(OUT, "domain/recipe.js"));
const semver = require(path.join(OUT, "domain/semver.js"));
const storeProfile = require(path.join(OUT, "domain/storeProfile.js"));
const orderStore = require(path.join(OUT, "data/orderStore.js"));
const receipt = require(path.join(OUT, "data/receipt.js"));

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name} :: dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`);
  }
}

const line = (unitPriceRp, qty) => ({ productId: "p1", variantId: null, productName: "Kopi", variantName: null, unitPriceRp, qty });
const baseCheckout = (over = {}) => ({
  lines: [line(15000, 2)],
  discountRp: 0,
  taxRp: 0,
  payment: { method: "cash", amountRp: 30000, paidAt: "2026-11-05T10:00:00.000Z" },
  idempotencyKey: "key-1",
  ...over,
});

console.log("\n[1] aritmetika uang");
check("calcLineTotal 15000x2", money.calcLineTotal(15000, 2), 30000);
check("calcLineTotal qty 0", money.calcLineTotal(15000, 0), 0);
check("calcLineTotal harga negatif", money.calcLineTotal(-100, 2), 0);
check("calcSubtotal", money.calcSubtotal([line(15000, 2), line(8000, 1)]), 38000);
check("calcTotal normal", money.calcTotal(30000, 0, 0, 0, 0), 30000);
check("calcTotal tidak negatif", money.calcTotal(1000, 5000, 0), 0);
check("formatRupiah", money.formatRupiah(15000), "Rp15.000");
check("formatThousands 50000", money.formatThousands(50000), "50.000");
check("formatThousands 1250000", money.formatThousands(1250000), "1.250.000");
check("formatThousands 0", money.formatThousands(0), "0");
check("formatThousands string", money.formatThousands("20000"), "20.000");
check("formatThousands kosong", money.formatThousands(""), "");
check("parseThousands 50.000", money.parseThousands("50.000"), 50000);
check("parseThousands 1.250.000", money.parseThousands("1.250.000"), 1250000);
check("parseThousands tanpa titik", money.parseThousands("50000"), 50000);
check("parseThousands dengan prefix Rp", money.parseThousands("Rp 50.000"), 50000);
check("parseThousands nilai negatif", money.parseThousands("-5.000"), -5000);
check("parseThousands jepit integer aman", money.parseThousands("999999999999999"), 999999999999);
check("parseThousands kosong", money.parseThousands(""), 0);

console.log("\n[2] validasi checkout");
check("keranjang kosong ditolak", typeof orders.validateCheckout(baseCheckout({ lines: [] })), "string");
check("qty 0 ditolak", typeof orders.validateCheckout(baseCheckout({ lines: [line(15000, 0)] })), "string");
check("harga non-integer ditolak", typeof orders.validateCheckout(baseCheckout({ lines: [line(15000.5, 1)] })), "string");
check("diskon > subtotal ditolak", typeof orders.validateCheckout(baseCheckout({ discountRp: 40000 })), "string");
check("bayar kurang ditolak", typeof orders.validateCheckout(baseCheckout({ payment: { method: "cash", amountRp: 1000, paidAt: "2026-11-05T10:00:00.000Z" } })), "string");
check("metode bayar asing ditolak", typeof orders.validateCheckout(baseCheckout({ payment: { method: "kripto", amountRp: 30000, paidAt: "2026-11-05T10:00:00.000Z" } })), "string");
check("pembulatan positif ditolak", typeof orders.validateCheckout(baseCheckout({ roundingRp: 500 })), "string");
check("pembulatan terlalu negatif ditolak", typeof orders.validateCheckout(baseCheckout({ roundingRp: -1000 })), "string");
check("pembulatan negatif valid lolos", orders.validateCheckout(baseCheckout({ roundingRp: -50, payment: { method: "cash", amountRp: 29950, paidAt: "2026-11-05T10:00:00.000Z" } })), null);
check("pembayaran non-tunai pas lolos", orders.validateCheckout(baseCheckout({ payment: { method: "qris_manual", amountRp: 30000, paidAt: "2026-11-05T10:00:00.000Z" } })), null);
check("pembayaran non-tunai kurang ditolak", typeof orders.validateCheckout(baseCheckout({ payment: { method: "qris_manual", amountRp: 25000, paidAt: "2026-11-05T10:00:00.000Z" } })), "string");
check("pembayaran non-tunai lebih ditolak", typeof orders.validateCheckout(baseCheckout({ payment: { method: "qris_manual", amountRp: 35000, paidAt: "2026-11-05T10:00:00.000Z" } })), "string");
check("checkout valid lolos", orders.validateCheckout(baseCheckout()), null);

console.log("\n[2b] alokasi diskon ke item");
check("diskon 3000 dari 30000+20000", orders.allocateDiscount([30000, 20000], 3000), [1800, 1200]);
check("jumlah alokasi selalu sama", orders.allocateDiscount([3333, 3333, 3334], 1000).reduce((a, b) => a + b, 0), 1000);
check("tanpa diskon", orders.allocateDiscount([15000], 0), [0]);
check("diskon > total dijepit", orders.allocateDiscount([1000], 5000).reduce((a, b) => a + b, 0), 1000);
check("baris tunggal dapat semua", orders.allocateDiscount([15000], 2500), [2500]);

console.log("\n[3] order jadi");
const o = orders.createCompletedOrder(baseCheckout({ payment: { method: "cash", amountRp: 50000, paidAt: "2026-11-05T10:00:00.000Z" } }), new Date("2026-11-05T10:00:00.000Z"));
check("total 30000", o.totalRp, 30000);
check("kembalian 20000", o.changeRp, 20000);
check("status completed", o.status, "completed");
check("id = idempotencyKey", o.id, "key-1");
check("receipt prefix R-", o.receiptNumber.startsWith("R-"), true);

console.log("\n[4] pembulatan");
check("tanpa pembulatan", settings.applyRounding(15300, 0), { rounded: 15300, roundingRp: 0 });
check("bulat ke bawah 100", settings.applyRounding(15300, 100), { rounded: 15300, roundingRp: 0 });
check("15350 -> 15300", settings.applyRounding(15350, 100), { rounded: 15300, roundingRp: -50 });
check("total 800 step 1000 tidak jadi 0", settings.applyRounding(800, 1000), { rounded: 800, roundingRp: 0 });

console.log("\n[5] HPP");
const r1 = resolve.resolveHpp("manual", 6000, null);
check("manual 6000", [r1.unitHppRp, r1.source], [6000, "manual"]);
check("resep menang", resolve.resolveHpp("recipe", 9999, 4500).unitHppRp, 4500);
check("resep kosong -> manual", resolve.resolveHpp("recipe", 7000, null).source, "manual");
check("none -> 0", resolve.resolveHpp("none", 5000, 4000).unitHppRp, 0);
check("negatif dijepit", resolve.resolveHpp("manual", -500, null).unitHppRp, 0);
check("margin 15000/6000", resolve.marginFor(15000, 6000), { profitRp: 9000, marginPct: 60, markupPct: 150 });
check("rugi terdeteksi", resolve.marginFor(5000, 6000).profitRp, -1000);

const recipe = hpp.calcHppForLine([
  { ingredientId: "g1", ingredientName: "Biji", qtyPerUnit: 18, costPerUnitRp: 200 },
  { ingredientId: "g2", ingredientName: "Susu", qtyPerUnit: 150, costPerUnitRp: 20 },
]);
check("HPP resep 3600+3000", recipe.perUnitRp, 6600);
const snap = hpp.snapshotForOrder("oi1", 2, recipe);
check("snapshot total x2", snap.hppTotalRp, 13200);
check("snapshot baris", snap.rows.length, 2);
check("calcHppTotal 6600x2", hpp.calcHppTotal(6600, 2), 13200);
check("calcHppTotal qty 0", hpp.calcHppTotal(6600, 0), 0);
check("calcHppTotal unit negatif", hpp.calcHppTotal(-500, 2), 0);
check("calcHppTotal unit desimal dipotong", hpp.calcHppTotal(100.9, 3), 300);
const lastCosts = hpp.resolveLastCost([
  { ingredientId: "susu", costPerUnitRp: 18.5, effectiveAt: "2026-11-05T08:00:00.000Z" },
  { ingredientId: "air", costPerUnitRp: 0.26, effectiveAt: "2026-11-05T08:00:00.000Z" },
]);
check("resolveLastCost simpan 2 desimal susu", lastCosts.get("susu"), 18.5);
check("resolveLastCost simpan 2 desimal air", lastCosts.get("air"), 0.26);

console.log("\n[6] shift");
const shift = { id: "s1", cashierName: "A", openedAt: "2026-11-05T08:00:00.000Z", closedAt: null, openCashRp: 0 };
const mkOrder = (createdAt, totalRp, status = "completed") => ({ ...o, id: createdAt, createdAt, totalRp, status });
const summary = shifts.summarizeShift(shift, [
  mkOrder("2026-11-05T09:00:00.000Z", 30000),
  mkOrder("2026-11-05T10:00:00.000Z", 20000),
  mkOrder("2026-11-05T07:00:00.000Z", 99000),
  mkOrder("2026-11-05T11:00:00.000Z", 50000, "voided"),
]);
check("2 order dalam shift", summary.orderCount, 2);
check("total shift 50000", summary.grandTotalRp, 50000);


console.log("\n[7] ringkasan penjualan");
{
  const t0 = new Date("2026-11-05T10:00:00.000Z");
  const row = (id, createdAt, status, totalRp, hppPerItem) => ({
    id,
    receiptNumber: "R-" + id,
    idempotencyKey: id,
    status,
    lines: [{ productId: "p1", variantId: null, productName: "Kopi", variantName: null, unitPriceRp: 15000, qty: 2, lineTotalRp: 30000, discountRp: 0, netTotalRp: 30000, hppTotal: hppPerItem }],
    subtotalRp: 30000,
    discountRp: 0,
    taxRp: 0,
    serviceChargeRp: 0,
    roundingRp: 0,
    totalRp,
    payment: { method: "cash", amountRp: totalRp, paidAt: createdAt },
    changeRp: 0,
    notes: null,
    createdAt,
  });
  const sample = [
    row("a", "2026-11-05T09:00:00.000Z", "completed", 30000, 12000),
    row("b", "2026-11-05T10:00:00.000Z", "completed", 25000, 10000),
    row("c", "2026-11-04T09:00:00.000Z", "completed", 40000, 15000),
    row("d", "2026-11-05T11:00:00.000Z", "voided", 20000, 8000),
  ];
  const start = sales.startOfDay(t0);
  const end = sales.endOfDay(t0);
  const sum = sales.summarizeSales(sample, start, end);
  check("2 transaksi hari ini", sum.orderCount, 2);
  check("omzet 55000", sum.grandTotalRp, 55000);
  check("HPP snapshot 22000", sum.totalHppRp, 22000);
  check("laba 38000", sum.grossProfitRp, 38000);
  check("margin 69.1%", sum.profitMarginPct, 69.1);
  const sampleWithFin = [
    {
      ...row("f1", "2026-11-05T09:00:00.000Z", "completed", 30950, 10000),
      lines: [{ productId: "p1", variantId: null, productName: "Kopi", variantName: null, unitPriceRp: 15000, qty: 2, lineTotalRp: 30000, discountRp: 0, netTotalRp: 30000, hppTotal: 10000 }],
      subtotalRp: 30000,
      taxRp: 2000,
      serviceChargeRp: 1000,
      roundingRp: -50,
      totalRp: 30950,
      payment: { method: "cash", amountRp: 30950, paidAt: "2026-11-05T09:00:00.000Z" },
    },
  ];
  const sumFin = sales.summarizeSales(sampleWithFin, start, end);
  check("laba memperhitungkan pembulatan dan service", sumFin.grossProfitRp, 20950);
  check("margin dihitung dari net sales tanpa pajak", sumFin.profitMarginPct, 72.4);
  check("1 void", sum.voidedCount, 1);
  const tp = sales.topProducts(sample, start, end);
  check("terlaris qty 4", tp[0].qty, 4);
  check("terlaris laba 38000", tp[0].profitRp, 38000);
  const pb = sales.paymentBreakdown(sample, start, end);
  check("tunai 2 transaksi", pb[0].orderCount, 2);
  check("tunai pakai total bersih", pb[0].totalRp, 55000);
  const overTender = [
    { ...row("x", "2026-11-05T12:00:00.000Z", "completed", 30000, 0), payment: { method: "cash", amountRp: 50000, paidAt: "2026-11-05T12:00:00.000Z" } },
    { ...row("y", "2026-11-05T12:05:00.000Z", "completed", 25000, 0), payment: { method: "cash", amountRp: 25000, paidAt: "2026-11-05T12:05:00.000Z" } },
  ];
  check("uang diterima berlebih tidak dihitung omzet", sales.paymentBreakdown(overTender, start, end)[0].totalRp, 55000);
  const kem = sales.rangeFor("yesterday", t0);
  check("kemarin 1 transaksi", sales.ordersInRange(sample, kem.start, kem.end).length, 1);
  const trend = sales.salesTrend(sample, start, end);
  check("tren hari ini 24 bucket", trend.points.length, 24);
  check("tren total = omzet", trend.totalRp, 55000);
  check("tren puncak 30000", trend.maxTotalRp, 30000);
  const weekRange = sales.rangeFor("last7", t0);
  const weekTrend = sales.salesTrend(sample, weekRange.start, weekRange.end);
  check("tren 7 hari 7 bucket", weekTrend.points.length, 7);
  check("tren 7 hari total", weekTrend.totalRp, 95000);
}

console.log("\n[8] PIN void (PBKDF2 + salt)");
{
  const first = await settings.hashVoidPin("1234");
  const second = await settings.hashVoidPin("1234");
  check("PIN tidak disimpan plaintext", first.hash === "1234", false);
  check("salt acak berbeda", first.salt === second.salt, false);
  const withPin = {
    ...settings.DEFAULT_SETTINGS,
    voidPinHash: first.hash,
    voidPinSalt: first.salt,
  };
  check("PIN benar diterima", await settings.verifyVoidPin("1234", withPin), true);
  check("PIN salah ditolak", await settings.verifyVoidPin("9999", withPin), false);
  check("tanpa hash ditolak", await settings.verifyVoidPin("1234", settings.DEFAULT_SETTINGS), false);
}

console.log("\n[9] satuan");
{
  check("1500 g -> 1.5 kg", units.convertQty(1500, "g", "kg"), 1.5);
  check("1.5 kg -> 1500 g", units.convertQty(1.5, "kg", "g"), 1500);
  check("750 ml -> 0.75 l", units.convertQty(750, "ml", "l"), 0.75);
  check("0.25 l -> 250 ml", units.convertQty(0.25, "l", "ml"), 250);
  check("satuan sama passthrough", units.convertQty(12, "pcs", "pcs"), 12);
  check("alias gram dikenali", units.normalizeUnit(" Gram "), "g");
  check("kg dan g kompatibel", units.isConvertible("kg", "g"), true);
  check("pcs dan butir tidak kompatibel", units.isConvertible("pcs", "butir"), false);
  check("satuan tak dikenal ditolak", units.convertQty(1, "ikat", "kg"), null);
  check("pcs ke kg ditolak", units.convertQty(1, "pcs", "kg"), null);
  check("pembulatan 3 desimal", units.convertQty(1 / 3, "kg", "g"), 333.333);
  check("format 1500 g menyebut 1.5 kg", units.formatQtyWithUnit(1500, "g"), "1500 g (1.5 kg)");
  check("format 12 pcs tanpa konversi", units.formatQtyWithUnit(12, "pcs"), "12 pcs");
  check("picker kg memuat g", units.getCompatibleUnits("kg").includes("g"), true);
}

console.log("\n[10] resep");
check("resep valid lolos", recipeDomain.validateRecipeLines([
  { ingredientId: "ing-1", qtyPerUnit: 10 },
  { ingredientId: "ing-2", qtyPerUnit: 25.5 },
]), null);
check("resep kosong ditolak", typeof recipeDomain.validateRecipeLines([]), "string");
check("resep tanpa bahan ditolak", typeof recipeDomain.validateRecipeLines([{ ingredientId: "", qtyPerUnit: 10 }]), "string");
check("takaran nol ditolak", typeof recipeDomain.validateRecipeLines([{ ingredientId: "ing-1", qtyPerUnit: 0 }]), "string");
check("takaran negatif ditolak", typeof recipeDomain.validateRecipeLines([{ ingredientId: "ing-1", qtyPerUnit: -5 }]), "string");
check("bahan duplikat ditolak", typeof recipeDomain.validateRecipeLines([
  { ingredientId: "ing-1", qtyPerUnit: 10 },
  { ingredientId: "ing-1", qtyPerUnit: 20 },
]), "string");
check("draft tanpa productId ditolak", typeof recipeDomain.validateRecipeDraft({ productId: "", variantId: null, lines: [{ ingredientId: "ing-1", qtyPerUnit: 10 }] }), "string");
check("versi baru dari null adalah 1", recipeDomain.nextRecipeVersion(null), 1);
check("versi baru dari undefined adalah 1", recipeDomain.nextRecipeVersion(undefined), 1);
check("versi baru bertambah 1", recipeDomain.nextRecipeVersion(1), 2);
check("versi bertambah dari v5 jadi v6", recipeDomain.nextRecipeVersion(5), 6);
check("pembulatan qty 3 desimal", recipeDomain.roundRecipeQty(1.23456), 1.235);

console.log("\n[11] refund");
{
  const transit = orders.canTransitionOrderStatus("completed", "refunded");
  check("completed -> refunded diizinkan", transit.allowed, true);
  const transitVoid = orders.canTransitionOrderStatus("completed", "voided");
  check("completed -> voided diizinkan", transitVoid.allowed, true);
  const noVoidToRefund = orders.canTransitionOrderStatus("voided", "refunded");
  check("voided -> refunded ditolak", noVoidToRefund.allowed, false);
  const noRefundToVoid = orders.canTransitionOrderStatus("refunded", "voided");
  check("refunded -> voided ditolak", noRefundToVoid.allowed, false);
  const noRefundToCompleted = orders.canTransitionOrderStatus("refunded", "completed");
  check("refunded -> completed ditolak", noRefundToCompleted.allowed, false);
  const sameStatus = orders.canTransitionOrderStatus("refunded", "refunded");
  check("refunded -> refunded ditolak", sameStatus.allowed, false);

  const t0 = new Date("2026-11-05T10:00:00.000Z");
  const row = (id, createdAt, status, totalRp, hppPerItem) => ({
    id,
    receiptNumber: "R-" + id,
    idempotencyKey: id,
    status,
    lines: [
      {
        productId: "p1",
        variantId: null,
        productName: "Kopi",
        variantName: null,
        unitPriceRp: 15000,
        qty: 2,
        lineTotalRp: 30000,
        discountRp: 0,
        netTotalRp: 30000,
        hppTotal: hppPerItem,
      },
    ],
    subtotalRp: 30000,
    discountRp: 0,
    taxRp: 0,
    serviceChargeRp: 0,
    roundingRp: 0,
    totalRp,
    payment: { method: "cash", amountRp: totalRp, paidAt: createdAt },
    changeRp: 0,
    notes: null,
    createdAt,
  });
  const sample = [
    row("a", "2026-11-05T09:00:00.000Z", "completed", 30000, 12000),
    row("b", "2026-11-05T10:00:00.000Z", "completed", 25000, 10000),
    row("c", "2026-11-04T09:00:00.000Z", "completed", 40000, 15000),
    row("d", "2026-11-05T11:00:00.000Z", "voided", 20000, 8000),
    row("e", "2026-11-05T12:00:00.000Z", "refunded", 35000, 10000),
  ];
  const start = sales.startOfDay(t0);
  const end = sales.endOfDay(t0);
  const sum = sales.summarizeSales(sample, start, end);
  check("orderCount tetap 2 (hanya completed)", sum.orderCount, 2);
  check("omzet mengecualikan order refunded", sum.grandTotalRp, 55000);
  check("HPP mengecualikan order refunded", sum.totalHppRp, 22000);
  check("laba mengecualikan order refunded", sum.grossProfitRp, 38000);
  check("1 refund tercatat", sum.refundedCount, 1);
  check("total refund Rp35.000", sum.refundedTotalRp, 35000);

  const tp = sales.topProducts(sample, start, end);
  check("top products mengecualikan order refunded", tp[0].qty, 4);

  const pb = sales.paymentBreakdown(sample, start, end);
  check("payment breakdown mengecualikan order refunded", pb[0].totalRp, 55000);

  const shiftTest = { id: "s-ref", cashierName: "K", openedAt: "2026-11-05T08:00:00.000Z", closedAt: null, openCashRp: 0 };
  const shiftSum = shifts.summarizeShift(shiftTest, [row("e", "2026-11-05T09:00:00.000Z", "refunded", 35000, 10000)]);
  check("rekap shift mengecualikan order refunded", [shiftSum.orderCount, shiftSum.grandTotalRp], [0, 0]);
}

{
  console.log("\n[12] struk 58mm");
  const normalLine = receipt.line("Subtotal", "Rp15.000");
  check("line normal 32 karakter", normalLine.length, 32);

  const longLeft = "Item Dengan Nama Yang Sangat Panjang Sekali";
  const truncatedLine = receipt.line(longLeft, "Rp100.000");
  check("line panjang dibatasi 32 karakter", truncatedLine.length, 32);
  check("left panjang dipotong dengan elipsis", truncatedLine.includes("…"), true);

  check("wrapText kosong", receipt.wrapText(""), []);
  check("wrapText per kata", receipt.wrapText("Jl. Mawar No. 1 Surakarta Jawa Tengah", 20), [
    "Jl. Mawar No. 1",
    "Surakarta Jawa",
    "Tengah",
  ]);
  check("wrapText kata terlalu panjang dipatah", receipt.wrapText("abcdefghij", 4), ["abcd", "efgh", "ij"]);
  const wrapAll = receipt.wrapText("kata ".repeat(60) + "x".repeat(70));
  check("wrapText tidak melebihi 32 karakter", wrapAll.every((l) => l.length <= 32), true);

  const sampleOrder = {
    id: "ord-12345678",
    receiptNumber: "R-001",
    idempotencyKey: "k1",
    status: "completed",
    lines: [{ productName: "Es Kopi Aren", variantName: null, qty: 1, unitPriceRp: 24000, lineTotalRp: 24000 }],
    subtotalRp: 24000,
    discountRp: 0,
    taxRp: 0,
    serviceChargeRp: 0,
    roundingRp: 0,
    totalRp: 24000,
    payment: { method: "cash", amountRp: 25000 },
    changeRp: 1000,
    notes: null,
    createdAt: "2026-11-13T03:00:00.000Z",
  };
  const plain = receipt.renderReceiptText(sampleOrder, { storeName: "Kedai Contoh" }).split("\n");
  check("struk tanpa profil: footer Terima kasih", plain.some((l) => l.trim() === "Terima kasih"), true);
  check("struk tanpa alamat/NPWP", plain.some((l) => l.includes("NPWP")), false);
  const rich = receipt
    .renderReceiptText(sampleOrder, {
      storeName: "Kedai Contoh",
      storeAddress: "Jl. Mawar No. 1 Surakarta Jawa Tengah",
      storeNpwp: "01.234.567.8-901.000",
      receiptHeader: "Buka setiap hari",
      receiptFooter: "Sampai jumpa lagi",
    })
    .split("\n");
  check("struk memuat alamat", rich.some((l) => l.includes("Jl. Mawar No. 1")), true);
  check("struk memuat NPWP", rich.some((l) => l.includes("NPWP: 01.234.567.8-901.000")), true);
  check("struk memuat header", rich.some((l) => l.includes("Buka setiap hari")), true);
  check("footer kustom menggantikan Terima kasih", rich.some((l) => l.includes("Terima kasih")), false);
  check("footer kustom tercetak", rich.some((l) => l.includes("Sampai jumpa lagi")), true);
  check("semua baris struk <= 32 karakter", rich.every((l) => l.length <= 32), true);
  check("nama toko di baris pertama", rich[0].trim(), "Kedai Contoh");
}

{
  console.log("\n[13] semver updater");
  check("v1.1.0 > 1.0.0", semver.isNewerVersion("v1.1.0", "1.0.0"), true);
  check("v1.0.1 > 1.0.0", semver.isNewerVersion("v1.0.1", "1.0.0"), true);
  check("v2.0.0 > 1.9.9", semver.isNewerVersion("v2.0.0", "1.9.9"), true);
  check("1.0.0 == 1.0.0", semver.isNewerVersion("1.0.0", "1.0.0"), false);
  check("v0.9.9 < 1.0.0", semver.isNewerVersion("v0.9.9", "1.0.0"), false);
  check("v1.0.0 < 1.0.1", semver.isNewerVersion("v1.0.0", "1.0.1"), false);
  check("v1.2 > 1.1.9", semver.isNewerVersion("v1.2", "1.1.9"), true);
}

console.log("\n[orderStore] order cacat tidak menjatuhkan aplikasi dan tidak hilang");
{
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => void mem.set(k, String(v)),
    removeItem: (k) => void mem.delete(k),
  };
  const good = (id) => ({
    id,
    receiptNumber: `R-${id}`,
    idempotencyKey: `k-${id}`,
    status: "completed",
    lines: [{ productId: "p", variantId: null, productName: "Kopi", variantName: null, unitPriceRp: 10000, qty: 1, lineTotalRp: 10000, discountRp: 0, netTotalRp: 10000 }],
    subtotalRp: 10000, discountRp: 0, taxRp: 0, serviceChargeRp: 0, roundingRp: 0, totalRp: 10000,
    payment: { method: "cash", amountRp: 10000, paidAt: "2026-11-13T03:00:00.000Z" },
    changeRp: 0, notes: null, createdAt: "2026-11-13T03:00:00.000Z",
  });
  const noPayment = { ...good("bad-1"), payment: undefined };
  const badStatus = { ...good("bad-2"), status: "weird" };
  const badMethod = { ...good("bad-3"), payment: { method: "crypto", amountRp: 1, paidAt: "x" } };
  const noLines = { ...good("bad-4"), lines: [] };
  const notObject = "garbage";
  const stored = [good("ok-1"), noPayment, badStatus, good("ok-2"), badMethod, noLines, notObject, null];
  const raw = JSON.stringify({ schemaVersion: 1, orders: stored });
  mem.set("pos.orders.v1", raw);

  const loaded = orderStore.loadOrders();
  check("hanya order yang terbaca dikembalikan", loaded.map((o) => o.id), ["ok-1", "ok-2"]);
  check("semua order terbaca punya payment.method", loaded.every((o) => typeof o.payment.method === "string"), true);
  check("pembacaan tidak mengubah data utama", mem.get("pos.orders.v1"), raw);
  const quarantine = () => JSON.parse(mem.get("pos.orders.quarantine.v1") ?? "[]");
  check("6 order cacat masuk karantina", quarantine().length, 6);
  orderStore.loadOrders();
  check("baca ulang tidak menggandakan karantina", quarantine().length, 6);

  orderStore.voidOrder("ok-1");
  const afterWrite = JSON.parse(mem.get("pos.orders.v1")).orders;
  check("setelah tulis ulang, daftar utama hanya berisi order valid", afterWrite.map((o) => o.id), ["ok-1", "ok-2"]);
  check("order cacat tetap utuh di karantina setelah tulis ulang", quarantine().length, 6);
  check("isi order cacat tidak berubah di karantina", quarantine().some((q) => q && q.id === "bad-2" && q.status === "weird"), true);

  mem.set("pos.orders.v1", JSON.stringify({ schemaVersion: 1, orders: [good("only")] }));
  mem.delete("pos.orders.quarantine.v1");
  check("data bersih: tidak ada karantina baru", (orderStore.loadOrders(), mem.has("pos.orders.quarantine.v1")), false);
  mem.set("pos.orders.v1", "{rusak");
  check("JSON rusak mengembalikan daftar kosong", orderStore.loadOrders(), []);
  delete globalThis.localStorage;
}

console.log("\n[Store_Profile]");
{
  const sp = storeProfile;
  const png = "data:image/png;base64,iVBORw0KGgo=";
  check("nilai awal netral", sp.profileFromRows([]), sp.DEFAULT_STORE_PROFILE);
  check("profil awal netral: hanya nama bawaan terisi", Object.entries(sp.DEFAULT_STORE_PROFILE).filter(([, v]) => v !== "").map(([k]) => k), ["name"]);
  check("nama bawaan netral", sp.DEFAULT_STORE_PROFILE.name, "Nama Toko");
  const full = {
    name: "Kedai Contoh",
    address: "Jl. Mawar No. 1",
    npwp: "01.234.567.8-901.000",
    logoB64: png,
    receiptHeader: "Selamat datang",
    receiptFooter: "Terima kasih",
  };
  check("baca-tulis bolak-balik", sp.profileFromRows(sp.profileToRows(full)), full);
  check("profileToRows memuat 6 kunci", sp.profileToRows(full).map((r) => r.key), [
    "toko.nama", "toko.alamat", "toko.npwp", "toko.logo_b64", "struk.header", "struk.footer",
  ]);
  check("baris tak dikenal diabaikan", sp.profileFromRows([{ key: "lain.x", value: "z" }]), sp.DEFAULT_STORE_PROFILE);
  check("nama kosong kembali ke default", sp.sanitizeStoreProfile({ name: "   " }).name, "Nama Toko");
  check("karakter kontrol dibuang", sp.sanitizeStoreProfile({ name: "A\u001bB\nC\u007f" }).name, "ABC");
  check("nama dibatasi 100 karakter", sp.sanitizeStoreProfile({ name: "x".repeat(150) }).name.length, 100);
  check("logo bukan PNG dikosongkan", sp.sanitizeStoreProfile({ logoB64: "data:text/html;base64,AAAA" }).logoB64, "");
  check("logo terlalu besar dikosongkan", sp.sanitizeStoreProfile({ logoB64: `data:image/png;base64,${"A".repeat(400_001)}` }).logoB64, "");
  check("logo PNG valid dipertahankan", sp.sanitizeStoreProfile({ logoB64: png }).logoB64, png);
  check("tipe bukan string ditolak", sp.sanitizeStoreProfile({ address: 123, npwp: null }).address, "");
}
rmSync(OUT, { recursive: true, force: true });
console.log(`\n=== ${fail === 0 ? `SEMUA LULUS (${pass})` : `${fail} GAGAL dari ${pass + fail}`} ===`);
process.exit(fail === 0 ? 0 : 1);
