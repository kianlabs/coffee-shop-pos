# Changelog

All notable changes to **Kopi POS** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

### Tested
- 110 domain unit tests passing (`scripts/test-domain.mjs`).
- 31 Playwright UI smoke tests passing across tablet (1280×800) and mobile (390×844) viewports.
