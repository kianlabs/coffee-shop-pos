# Design System

This document is the design contract for the UI overhaul. New and migrated
screens follow it; review pull requests against it.

## Stack

| Concern | Choice | Why |
|---------|--------|-----|
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) | Utility classes keep styles next to markup; familiar to most contributors. |
| Components | [shadcn/ui](https://ui.shadcn.com) (Radix primitives), in `src/components/ui/` | Accessible primitives (focus trap, Escape, ARIA) whose source lives in the repo and can be edited. |
| Icons | `lucide-react` | Same set shadcn/ui uses; tree-shaken per icon. |
| Toasts | `sonner` via `src/components/ui/sonner.tsx` | Light theme only. |
| Font | Inter Variable via `@fontsource-variable/inter` | Bundled, so it renders offline and passes the `font-src 'self'` CSP. |

Add a component with `npx shadcn@latest add <name>`. Pin new dependencies to
exact versions.

## Tokens

All colors live in `src/styles/globals.css` as CSS custom properties and are
exposed to Tailwind through `@theme inline` (`bg-primary`, `text-muted-foreground`,
`border-border`, `bg-success-soft`, ...). Components never use literal hex,
rgb, or hsl values.

- Identity: Suro POS takes its look from Surakarta batik. **Nila** (natural
  indigo, `primary`) carries actions, focus, selection, and the sidebar.
  **Sogan** (warm brown-gold, `sogan`, `sogan-soft`, `sogan-strong`) is the
  accent and appears only at the key moment: the brand mark, the active
  navigation marker, and the cart total. The base is warm paper
  (`background`) with white cards.
- Brand mark: one kawung motif (`src/components/common/BrandMark.tsx`). The
  repeating kawung texture (`KawungPattern`) is used once, at 5% opacity,
  behind the tablet sidebar. Do not add it elsewhere.
- Category colors (`cat-1` … `cat-6`) are muted batik tones assigned by
  category position. They mark which category a product belongs to (chip dot
  and tile monogram) so cashiers find items faster. They are not decoration;
  do not use them for anything else.
- Status colors carry meaning only: `success` (paid, change due),
  `destructive` (void, delete, errors), `warning` (low stock, offline),
  `info` (sync, hints).
- Type: Inter for body text and tables; Plus Jakarta Sans (`font-display`,
  designed in Jakarta) for headings, the brand, and large amounts.
- Radius: `--radius` 0.625rem. Cards `rounded-lg`, controls `rounded-md`, pills
  only for status badges.
- Shadows: none on cards; a border separates surfaces. Popovers and dialogs use
  the shadcn defaults.
- Prices and quantities use `tabular-nums` so digits line up.
- High contrast: `data-contrast="high"` on `<html>` swaps the foreground, muted,
  border, and ring tokens.

`src/styles/theme.css` holds the legacy styles. Its variables that clashed with
shadcn names are prefixed `--pos-` (`--pos-accent`, `--pos-radius`). The file
shrinks as screens move to the new components and is deleted at the end.

## Layout

| Width | Layout |
|-------|--------|
| 360–767 px (phone) | Bottom navigation; cart opens as a full-height sheet. |
| 768–1279 px (tablet portrait) | Collapsed side rail; cart as a right sheet. |
| ≥ 1280 px (tablet landscape) | Side rail + product grid + fixed cart column. |

No horizontal scrolling on the cashier, report, or settings screens.

## Cashier screen rules

Based on the patterns in Square, Shopify POS, Moka, and Loyverse, and on the
POS design principles described by
[UX Journal](https://medium.com/uxjournal/the-design-principles-in-the-pos-system-pos-design-guide-part-2-57d1bcb30ac0)
and [Shopify](https://www.shopify.com/my/retail/pos-ui):

1. The cart column always shows the total and the primary **Bayar** button
   without scrolling. The line list scrolls; the footer does not.
2. Payment (method, amount tendered, quick amounts, change) happens in a
   dedicated dialog opened by **Bayar**, not inline in the cart.
3. Product tiles have one fixed height. Variants open a picker; they do not
   expand the tile.
4. A product without variants is one tap to add. A cash sale with exact change
   takes at most 4 taps: product, Bayar, Uang pas, Selesai.
5. Touch targets are at least 44 × 44 px with 8 px between them
   (`h-touch`, `gap-2`).
6. Every icon button has an `aria-label`. Status is never shown by color alone.

## States every screen handles

Loading (skeleton after 300 ms), empty (names the data type plus one action
that adds the first item), error (toast that stays until dismissed, form data
kept), and success (toast that hides after the configured duration).
Destructive actions use `AlertDialog` with focus on Cancel.
