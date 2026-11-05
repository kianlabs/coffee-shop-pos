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

rmSync(OUT, { recursive: true, force: true });
console.log(`\n=== ${fail === 0 ? `SEMUA LULUS (${pass})` : `${fail} GAGAL dari ${pass + fail}`} ===`);
process.exit(fail === 0 ? 0 : 1);
