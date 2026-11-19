# Content Security Policy (task 28.1, requirement 20.6)

The policy is a `<meta http-equiv="Content-Security-Policy">` in `index.html`. The Android WebView serves the bundled `dist/` from the app origin, so the same policy applies on the tablet and in the browser. `npm run build && npm run smoke:ui` fails on any CSP console error, so a violation from a new feature is caught there.

Nobody could test a tightened policy on a real tablet when this was written, so the policy only adds directives that cannot change rendering or network use. Nothing that was allowed before is now blocked.

| Directive | Value | Why |
|---|---|---|
| `default-src` | `'self'` | Deny by default. Any resource type not listed below is same-origin only. |
| `script-src` | `'self'` | Only bundled scripts run. No inline script, no `eval`, no `new Function`. |
| `style-src` | `'self' 'unsafe-inline'` | React sets `style` attributes, and Radix and Sonner create `<style>` elements at runtime. Hashes break on every library change and a nonce is impossible in a static `<meta>`. Inline styles cannot run script. |
| `img-src` | `'self' data: blob:` | Bundled assets, inline data URIs, and `blob:` for generated previews (QR, receipt, logo, product photos). No remote images. |
| `font-src` | `'self'` | Fonts are bundled. |
| `connect-src` | `'self' https: http:` | See below. |
| `frame-src` | `'none'` | The app embeds no iframes. Added in 28.1; `default-src` would otherwise allow same-origin frames. |
| `object-src` | `'none'` | No plugins. |
| `form-action` | `'self'` | The app submits no HTML form to another origin. Added in 28.1. `default-src` does not cover this directive. |
| `base-uri` | `'self'` | Blocks `<base>` injection that would redirect relative URLs. |

`frame-ancestors` is absent on purpose. Browsers ignore it in `<meta>` and log a console error. It works only as an HTTP header, which a Capacitor app does not serve.

## Why connect-src stays broad

The sync endpoint is entered by the owner in Settings, so the host is unknown at build time. The updater talks to `api.github.com`. A host list would break sync for real deployments or need a rebuild per customer. Cleartext `http:` stays allowed because LAN sync servers and local development use it.

The narrower rules live in code and in Android, not in CSP: `isSyncEndpointAllowed` (`src/data/sync.ts`) validates the endpoint, and `network_security_config.xml` forbids cleartext traffic except for `localhost`, `127.0.0.1` and `10.0.2.2`. Injected script is the main exfiltration risk, and `script-src 'self'` blocks it before `connect-src` matters.

## Stricter options to evaluate on a real tablet

Test each on the target tablet (print, sync, updater, photos, QR) before shipping.

1. `connect-src 'self' https: http://localhost:* http://127.0.0.1:* http://10.0.2.2:*`. Drops general cleartext. It matches `network_security_config.xml` but breaks any LAN `http://` sync server. `http://[::1]` cannot be written in a CSP source list.
2. `worker-src 'self'`, `manifest-src 'self'`. Both already fall back to `script-src` and `default-src`, so the gain is small. Check that no blob worker is used.
3. `form-action 'none'`. Stricter than `'self'`; safe only if no `<form>` ever relies on native submit.
4. `style-src 'self'` with `style-src-attr 'unsafe-inline'`. Needs Radix and Sonner to stop injecting `<style>` elements, or a nonce, which a static `<meta>` cannot carry.
5. `img-src` without `blob:` if product photos and QR are changed to `data:` URIs.
6. `require-trusted-types-for 'script'`. Check every dependency first.
