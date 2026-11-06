# Contributing to Kopi POS

Thank you for your interest in contributing to **Kopi POS**! This project is an offline-first Point of Sale application specifically tailored for specialty coffee shops, slow bars, and micro-roasteries.

Please take a few moments to review these guidelines before submitting issues or pull requests.

---

## 🏛️ Core Architectural Principles

When contributing code to this repository, you must preserve these non-negotiable principles:

1. **Integer Rupiah Arithmetic**:
   All monetary amounts are strictly integers (`Rupiah = number`, with `Number.isInteger(amount)`). Never use floating-point numbers for currency calculations.
2. **Local-First & Offline Resilience**:
   The local SQLite database on the Android tablet is the single operational source of truth. Every sale, inventory deduction, and shift event must commit locally to SQLite before any network or hardware operations.
3. **Non-Blocking Printing**:
   A sale is finalized when written to the database. Thermal printer status, paper out, or Bluetooth disconnections must never rollback, cancel, or duplicate a committed transaction.
4. **HPP Snapshots**:
   Every sold order item must retain an immutable snapshot of its Unit Cost of Goods Sold (HPP) at the exact moment of sale.
5. **Atomic Stock Movements**:
   Inventory deductions and replenishments must produce immutable `stock_movements` rows tied to an idempotency key.

---

## 🛠️ Development Setup

1. **Clone and Install**:
   ```bash
   git clone https://github.com/kianlabs/coffee-shop-pos.git
   cd coffee-shop-pos
   npm install
   ```

2. **Run Local Dev Server**:
   ```bash
   npm run dev
   ```

3. **Run Typecheck & Unit Tests**:
   ```bash
   npm run typecheck
   npm test
   ```

4. **Run UI Smoke Tests** (requires Chromium):
   ```bash
   npm run smoke:ui
   ```

5. **Compile Android Assets & Build APK**:
   ```bash
   npm run android:assets
   npm run apk
   ```

---

## 📋 Git Commit Guidelines

We adhere to the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` Adds a new user-facing or technical capability (e.g. `feat(receipt): add thermal logo printing`)
- `fix:` Patches a bug or regression (e.g. `fix(rounding): clamp negative cashier rounding`)
- `refactor:` Code restructuring without behavioral changes
- `test:` Adding or updating unit/smoke test suites
- `docs:` Documentation improvements
- `chore:` Tooling, dependencies, or configuration changes

---

## 🚀 Pull Request Checklist

Before submitting a Pull Request, ensure:
- [ ] `npm run typecheck` passes with zero errors.
- [ ] `npm test` passes all 110 domain unit tests.
- [ ] `npm run build` succeeds without build warnings or chunk errors.
- [ ] No secrets, private keys, or credentials are committed.
- [ ] Any SQLite schema changes include a forward migration in `src/data/migrations.ts` and are updated in `database/sqlite-schema.sql`.
