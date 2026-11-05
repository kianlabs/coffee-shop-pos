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
    "src/data/settings.ts",
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

console.log("\n[2] validasi checkout");
check("keranjang kosong ditolak", typeof orders.validateCheckout(baseCheckout({ lines: [] })), "string");
check("qty 0 ditolak", typeof orders.validateCheckout(baseCheckout({ lines: [line(15000, 0)] })), "string");
check("harga non-integer ditolak", typeof orders.validateCheckout(baseCheckout({ lines: [line(15000.5, 1)] })), "string");
check("diskon > subtotal ditolak", typeof orders.validateCheckout(baseCheckout({ discountRp: 40000 })), "string");
check("bayar kurang ditolak", typeof orders.validateCheckout(baseCheckout({ payment: { method: "cash", amountRp: 1000, paidAt: "2026-11-05T10:00:00.000Z" } })), "string");
check("metode bayar asing ditolak", typeof orders.validateCheckout(baseCheckout({ payment: { method: "kripto", amountRp: 30000, paidAt: "2026-11-05T10:00:00.000Z" } })), "string");
check("pembulatan positif ditolak", typeof orders.validateCheckout(baseCheckout({ roundingRp: 500 })), "string");
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

rmSync(OUT, { recursive: true, force: true });
console.log(`\n=== ${fail === 0 ? `SEMUA LULUS (${pass})` : `${fail} GAGAL dari ${pass + fail}`} ===`);
process.exit(fail === 0 ? 0 : 1);
