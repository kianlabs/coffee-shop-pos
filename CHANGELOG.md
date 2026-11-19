# Changelog

All notable changes to **Suro POS** (formerly Kopi POS) are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Store profile**: store name, address, tax ID (NPWP), logo, and receipt header/footer are now editable in Settings and stored per device. Receipts print the address, tax ID, header, and a custom footer when set.
- **Repository guards** (`npm run check`, also run in CI): fail on client branding, tracked `.apk` files, AI assistant instruction files, and broken README links.
- Bilingual README (`README.md`, `README.id.md`) with screenshots, `CODE_OF_CONDUCT.md`, issue and pull request templates, and label definitions.
- `scripts/check-changelog.mjs` to validate this file and to require an entry for each release tag.
- UI foundation: Tailwind CSS v4, shadcn/ui components in `src/components/ui/`, lucide icons, bundled Inter font, and design tokens in `src/styles/globals.css`. See `docs/design-system.md`.

### Changed
- The default store name is now neutral ("Nama Toko") instead of a specific shop's name.
- `scripts/capture-tablet-screenshots.mjs` writes to `docs/screenshots/` instead of a machine-specific path.
- Release artifacts are named `Kopi-POS-<tag>.apk`.
- The interface uses a neutral grey palette with smaller corner radii instead of the warm coffee palette.
- Every screen is rebuilt on shadcn/ui components. `App.tsx` is now a 70-line shell; screens live in `src/features/<screen>/` and shared state in Zustand stores (`src/stores/`). Stored carts, held orders, and open shifts carry over unchanged.
- Cashier: fixed-height product tiles, variants chosen in a picker, a cart column whose total and **Bayar** button never scroll away, and payment in its own dialog (method, quick amounts, numpad, change). Phones and portrait tablets get a cart bar that opens the cart as a sheet.
- Phone navigation shows Kasir, Riwayat, and Laporan in the bottom bar; the other screens are under **Lainnya**.
- Confirmations, PIN entry, and backup passphrases use accessible dialogs instead of browser `confirm`/`prompt`. Errors stay on screen until dismissed.
- Settings are grouped into Toko, Kasir, Shift, Printer, Keamanan, and Tentang tabs.
- `npm run smoke:ui` and `npm run test:e2e` drive the new UI through `data-testid` hooks; the E2E suite now also covers discounts, tax, service charge, rounding, refunds, and phone layout, and exits non-zero on any failure.

### Removed
- `src/styles/theme.css` and the legacy `Icon`, `ProductItem`, `CatalogEditor`, `StockEditor`, `HppEditor`, `RecipeEditor`, `SalesReport`, `SalesTrendChart`, and `StoreProfileFields` components.
- The client-specific APK from the repository tree. APK files are published only on GitHub Releases.

---

## [1.0.1] - 2026-11-11

### Fixed
- **Kasir Cart Layout & Scroll**:
  - Pinned baris Kembalian (`.change-row`) dan tombol Bayar (`.pay-btn`) di bagian bawah `.cart-action-bar` agar tidak pernah terpotong saat numpad aktif.
  - Membungkus area keranjang dengan `.cart-middle` (`min-height: 0; overflow-y: auto`) sehingga item panjang dan numpad dapat di-scroll lancar.
- **SQLite Android PRAGMA Handling**:
  - Mengubah eksekusi `PRAGMA busy_timeout` dan `PRAGMA journal_mode = WAL` menggunakan `db.query()` untuk menghilangkan error Logcat Android SQLite.

### Added
- **Touch Numpad Setting**:
  - Touch Numpad kasir aktif secara default saat metode Tunai dipilih.
  - Menambahkan toggle pengaturan "Papan Angka Kasir (Touch Numpad)" di menu Pengaturan.

---

## [1.0.0] - 2026-11-07

### Added
- **58mm Thermal ESC/POS Receipt Logo Printing**:
  - Native Android bridge support (`PrinterPlugin.java` & `EscPosRaster.java`) utilizing `GS v 0` raster bit images.
  - Custom Base64 logo upload with live thumbnail preview and toggle in Settings.
  - In-memory bounds checking (`inJustDecodeBounds`, max 2048x2048) and `OutOfMemoryError` guards for 4GB Android tablets.
  - Dynamic paper feed adjustment (6 newlines) to align cleanly with hardware tear bars.
- **Tablet-First Landscape UI (1280×800)**:
  - Ergonomic 380px sticky order cart with 42px touch steppers.
  - Product cards featuring multi-variant pill tags (`2 varian`) and starting price indicators (`mulai Rp...`).
  - *Smart Non-Cash Toggle*: automatically collapses cash change calculations when QRIS or EDC is selected, freeing up 100px of vertical space.
  - Navigation rail with amber gold accent indicator (`#d49b5c`).
- **Database Schema V7 Migration**:
  - Added unique constraint protecting `order_refund` in `uq_stock_movements_ref`.
  - Added composite index `idx_order_items_order_created` for accelerated historical queries and sales reports.
- **Security & Lockout Protections**:
  - Persistent 5-minute lockout upon 3 consecutive failed Supervisor PIN attempts.
  - Protected settings modification requiring current PIN authorization.
  - ProGuard rules protecting Capacitor plugins, SQLite connection classes, and native printer reflection.

### Changed
- Refactored `orderRepository.ts` to enforce explicit atomic manual transactions (`db.run(..., false)`).
- Upgraded `hpp.ts` to allow precise decimal unit costs without premature integer truncation.
- Memoized product variant lookups to prevent full catalog re-renders upon cart mutation.
- Test coverage at this release: 110 domain unit tests (`scripts/test-domain.mjs`) and 31 UI smoke tests across tablet (1280×800) and mobile (390×844) viewports.
