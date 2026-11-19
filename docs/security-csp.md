# Content Security Policy (task 28.1, requirement 20.6)

The policy is a `<meta http-equiv="Content-Security-Policy">` in `index.html`. The Android WebView serves the bundled `dist/` from the app origin, so the same policy applies on the tablet and in the browser. `npm run build && npm run smoke:ui` fails on any CSP console error, so a violation introduced by a new feature is caught in CI.

| Directive | Value | Why |
|---|---|---|
| `default-src` | `'self'` | Deny by default; every resource type not listed below is same-origin only. |
| `script-src` | `'self'` | Only bundled scripts run. No inline script, no `eval`, no `new Function` (Vite output has none). |
| `style-src` | `'self' 'unsafe-inline'` | Needed, see "Why `'unsafe-inline'` for styles". |
| `img-src` | `'self' data: blob:` | Bundled assets, small inline data URIs, and `blob:` for generated QR/receipt/logo previews. No remote images. |
| `font-src` | `'self'` | Fonts are bundled; no font CDN. |
| `connect-src` | `'self' https: http://localhost:* http://127.0.0.1:* http://10.0.2.2:*` | See "Why connect-src is not a host list". |
| `worker-src` | `'self'` | Only same-origin workers (e.g. sql.js worker/WASM loading). |
| `manifest-src` | `'self'` | Web manifest is bundled. |
| `frame-src` | `'none'` | The app embeds no iframes. |
| `object-src` | `'none'` | No plugins. |
| `form-action` | `'none'` | The app never submits an HTML form to a server; all writes go through JS. |
| `base-uri` | `'self'` | Blocks `<base>` injection that would redirect relative URLs. |

`frame-ancestors` is deliberately absent: browsers ignore it in `<meta>` and log a console error. It only works as an HTTP header, which a Capacitor app does not serve. The WebView is not embeddable by other apps.

## Why connect-src is not a host list

The sync endpoint is entered by the owner in Settings, so the host is unknown at build time. The updater talks to `api.github.com` (`src/services/appUpdater.ts`). A static list would either break sync for every real deployment or need a rebuild per customer. The compromise:

- `https:` is allowed to any host. Cleartext `http:` is **not** allowed in general.
- `http:` is allowed only for the loopback/emulator hosts that `isSyncEndpointAllowed` in `src/data/sync.ts` also accepts: `localhost`, `127.0.0.1`, and `10.0.2.2` (Android emulator host). `http://[::1]` is accepted by the sync validator but cannot be expressed in a CSP source list (Chromium rejects it as an invalid source), so it is blocked by CSP; use `localhost`.
- The app code enforces the narrower rule: the sync endpoint must be https (or those loopback hosts), and the updater URL is fixed in code. CSP is the outer layer; the Android `network_security_config.xml` is a second layer that forbids cleartext except for the same three dev hosts. It needed no change.

Residual risk: an injected script could call any https host. Since `script-src 'self'` blocks injected script in the first place, the exfiltration path is closed upstream of `connect-src`.

## Why `'unsafe-inline'` for styles

Tightening styles to `'self'` was tried and rejected by the smoke test. React sets `style` attributes, and Radix (via `react-style-singleton`, used by dialogs/sheets) and Sonner (toasts) create `<style>` elements at runtime with content that changes with state. Hashes break on every library or layout-state change, and a nonce is impossible in a static `<meta>`. Inline styles cannot run script, so this is accepted; `script-src` stays strict. Revisit if those libraries gain a CSP-friendly mode.

## Changes from the previous policy

- `connect-src` lost blanket `http:`; only the loopback hosts keep it.
- Added `worker-src`, `manifest-src`, `frame-src 'none'`, `form-action 'none'`.
