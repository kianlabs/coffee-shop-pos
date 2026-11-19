# Contributing to Suro POS

Thank you for your interest in contributing. Suro POS is an offline-first Point of Sale app for cafés and small food and beverage shops. Please read this page before opening an issue or a pull request.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). You can write issues and pull requests in English or Bahasa Indonesia.

## Where to start

- **Found a bug?** Open an issue with the bug template. Include the steps to reproduce, the app version, and your device or browser.
- **Security problem?** Do not open a public issue. Follow [SECURITY.md](SECURITY.md).
- **Have an idea?** Open an issue with the feature template and describe the problem first. For anything larger than a small fix, please agree on the approach in the issue before writing code.
- **Want to read the code first?** Start with [docs/architecture.md](docs/architecture.md).

### Labels and picking up work

| Label | Meaning |
| :--- | :--- |
| `good first issue` | Small, clearly scoped, and does not need Android or printer hardware. A good first contribution. |
| `help wanted` | Maintainers would welcome a contribution, but it may be larger or need more context. |
| `printer`, `android` | Needs a physical printer or the Android toolchain to test. |
| `needs-info` | Waiting for more details from the reporter. |

To claim an issue, comment on it saying you would like to work on it. A maintainer will confirm. If there is no update for two weeks, the issue may be offered to someone else. Label definitions live in [.github/labels.yml](.github/labels.yml).

## Core principles

When contributing code, preserve these rules:

1. **Integer Rupiah arithmetic.** All money is a whole number (`Number.isInteger(amount)`). Never use floating-point for currency.
2. **Local first, offline resilient.** The local database is the source of truth. Every sale, stock change, and shift event is committed locally before any network or hardware operation.
3. **Non-blocking printing.** A sale is final once it is written to the database. A printer error, paper out, or Bluetooth drop must never roll back, cancel, or duplicate a committed sale.
4. **HPP snapshots.** Each sold order line keeps an immutable snapshot of its unit cost (HPP) at the moment of sale.
5. **Atomic stock movements.** Stock changes produce immutable `stock_movements` rows tied to an idempotency key.
6. **Works in the browser and on Android.** Storage is SQLite on Android and `localStorage` in the browser. A feature that saves data must support both. See [docs/architecture.md](docs/architecture.md).

## Development setup

You need Node.js 20 or 22. **You do not need the Android SDK** to work on the web app.

```bash
git clone https://github.com/kianlabs/coffee-shop-pos.git
cd coffee-shop-pos
npm install
npm run dev          # http://localhost:5173
```

Before you open a pull request, run:

```bash
npm run typecheck    # TypeScript strict mode
npm test             # domain unit tests and repository guard tests
npm run build        # production bundle
npm run check        # repository guards (see below)
```

If you changed the UI, also run these (they use the built app, so run `npm run build` first; they need Chromium or Chrome installed):

```bash
npm run smoke:ui
npm run test:e2e
```

Building the Android app needs JDK 21 and the Android SDK:

```bash
npm run android:assets
npm run apk
```

### Repository guards

`npm run check` fails if the repository contains:

- a client or shop name that should live in the store profile instead of the code,
- a tracked `.apk` file (release APKs belong on GitHub Releases only),
- AI assistant instruction files or folders such as `.kiro/`, `.claude/`, `.cursor/`, `CLAUDE.md`, or `AGENTS.md`,
- a broken link or image in the README files, or an invalid `CHANGELOG.md`.

CI runs the same checks. Please do not commit editor, assistant, or local state folders.

## Workflow

1. Fork the repository and create a branch from `main`, named `feature/short-name` or `fix/short-name`.
2. Make small, focused commits. Each commit should be one logical change.
3. Open a pull request against `main` and fill in the template.
4. Address review comments by pushing more commits to the same branch.

### Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/) in the form `type(scope): description`:

- `feat` adds a capability, for example `feat(receipt): print store address`
- `fix` repairs a bug, for example `fix(rounding): clamp negative rounding`
- `refactor`, `perf`, `style` change code without changing behavior
- `test` adds or updates tests
- `docs` changes documentation only
- `ci` changes workflows or repository checks
- `chore` covers tooling and dependencies

## Pull request checklist

- [ ] `npm run typecheck`, `npm test`, `npm run build`, and `npm run check` all pass.
- [ ] New logic has tests, and money stays in whole Rupiah.
- [ ] Schema changes include a new upgrade in `src/data/migrations.ts` and an update to `database/sqlite-schema.sql` (see the migration guide in [docs/architecture.md](docs/architecture.md)).
- [ ] User-visible changes are listed under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
- [ ] No secrets, private keys, client names, APK files, or assistant instruction files are included.

## For maintainers

- Protect the `main` branch in the repository settings: require pull requests, and require the CI checks **Typecheck, Test & Build** (Node 20.x and 22.x) to pass before merging.
- Release by pushing a tag `vX.Y.Z`. The release workflow refuses to run unless `CHANGELOG.md` has an entry for that version. Move the notes from `[Unreleased]` into a dated `[X.Y.Z]` section first.
- Create the labels listed in [.github/labels.yml](.github/labels.yml) so contributors can find `good first issue` and `help wanted`.
