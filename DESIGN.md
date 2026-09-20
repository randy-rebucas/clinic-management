---
name: Clinic Management System
description: Multi-role clinic operations SaaS — scheduling, clinical documentation, billing, and inventory in one system.
colors:
  primary: "#3b82f6"
  primary-dark: "#2563eb"
  primary-light: "#dbeafe"
  brand-mark-teal: "#0EA5A4"
  public-brand-teal: "#0EA5A4"
  public-brand-teal-dark: "#0A7F7E"
  public-brand-teal-light: "#E3F6F5"
  public-brand-blue: "#2563EB"
  public-brand-navy: "#0B2136"
  success: "#10b981"
  warning: "#f59e0b"
  danger: "#ef4444"
  accent-purple: "#a855f7"
  neutral-bg: "#f8fafc"
  neutral-fg: "#0f172a"
  neutral-surface: "#ffffff"
  neutral-border: "#d1d5db"
  neutral-border-subtle: "#e5e7eb"
  neutral-muted: "#6b7280"
  neutral-strong: "#111827"
typography:
  display:
    fontFamily: "var(--font-geist-sans), system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 2.25rem)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "var(--font-geist-sans), system-ui, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "var(--font-geist-sans), system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "var(--font-geist-sans), system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.05em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "12px 24px"
    typography: "{typography.title}"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
  button-secondary:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-fg}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  input-default:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-fg}"
    rounded: "{rounded.lg}"
    padding: "12px 16px 12px 48px"
  card-surface:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-fg}"
    rounded: "{rounded.md}"
    padding: "16px"
  sidebar-nav-item-active:
    backgroundColor: "{colors.primary-light}"
    textColor: "#1e3a8a"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  badge-pill:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.primary-dark}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
    typography: "{typography.label}"
---

# Design System: Clinic Management System

## Overview

**Creative North Star: "The Operations Console"**

This is a working console for people who spend their whole shift in it: front-desk staff booking patients between phone calls, nurses documenting a visit, billing staff closing an invoice, an admin scanning a dashboard between meetings. The build treats every screen as an instrument panel, not a showcase — dense information, color-coded status at a glance, and one consistent accent (blue-to-indigo) that marks anything interactive or "yours to act on" across all seven roles. Nothing in the shipped code performs restraint for its own sake: buttons carry gradients, hover states lift with shadow and scale, and stat cards use tinted color per metric. That liveliness is native to the build and is recorded here as the system, not softened into something it isn't.

**Public site divergence (homepage, `PublicLayout` header/footer):** these surfaces have since moved to their own brand palette — pulled from the `BrandLogo` mark's teal (`#0EA5A4`) rather than the console's blue/indigo — and away from gradients entirely. No gradient fills, gradient text, or gradient buttons appear anywhere in the public site; color transitions are solid, and images blend into sections via alpha-mask edge fades (not color-gradient glows) instead of hard-bordered boxes. The authenticated app (sidebar, dashboards, role screens) is unaffected and still runs the blue → indigo gradient system described below. Treat "public site" and "authenticated app" as two accent systems sharing one type/spacing/shape language, not one palette.

**Key Characteristics:**
- One accent family (blue → indigo) carries all primary actions, active nav state, and links across every role's screens.
- Status and metric color is semantic and role-based (green=success/active, amber=warning, red=danger/error), not decorative.
- Soft, layered elevation (shadow-sm/md/lg/xl) responding to hover and hierarchy — never flat, never hard-offset.
- Generously rounded corners (8–16px) on nearly every surface; pills (full radius) for status and category tags.
- Iconography is exclusively inline stroke-style outline SVG (Heroicons-style, 1.5–2px stroke), never glyph/emoji icons or icon fonts.

## Colors

The palette is a single blue/indigo functional accent over a slate-gray neutral scale, with a small fixed semantic set (green/amber/red) for state, plus one ad hoc purple used only in dashboard stat-card tinting.

### Primary
- **Clinic Blue** (`#3b82f6`, `--primary`): the default accent — primary buttons, links, focus rings, active sidebar item text, chart/stat highlight.
- **Clinic Blue Deep** (`#2563eb`, `--primary-dark`): hover/pressed state for primary actions; the gradient's dark stop (`from-blue-600 to-indigo-600` and similar) on CTAs, headers, and the login/marketing hero panel.
- **Clinic Blue Pale** (`#dbeafe`, `--primary-light`): tint background for active nav rows, info badges, and selected states.

### Neutral
- **Console Background** (`#f8fafc`, `--background`): the page background behind all authenticated app screens.
- **Console Ink** (`#0f172a`, `--foreground`): default body text color.
- **Surface White** (`#ffffff`): cards, the sidebar, headers, and form fields sit on plain white, not on the console background.
- **Border Gray** (`#d1d5db`, `gray-300`): default 1–2px borders on cards, inputs, and the sidebar's right edge.
- **Divider Gray** (`#e5e7eb`, `gray-200`): lighter separators (footer rules, section dividers, subtle card borders).
- **Muted Gray** (`#6b7280`, `gray-500`): secondary/help text, placeholder-adjacent copy.
- **Strong Gray** (`#111827`, `gray-900`): headings and high-emphasis text where pure black would be too harsh.

### Semantic (state)
- **Success Green** (`#10b981`): active subscription, completed/positive status, confirmation icons.
- **Warning Amber** (`#f59e0b`): pending/expiring states, caution banners.
- **Danger Red** (`#ef4444`): errors, destructive actions, expired/cancelled status, required-field asterisks.

### Public Site Palette
The homepage and `PublicLayout` (header/footer) run a separate, solid-color accent drawn from the `BrandLogo` mark instead of blue/indigo:
- **Brand Teal** (`#0EA5A4`, `--brand-teal`): primary CTAs, links, active icon fills.
- **Brand Teal Deep** (`#0A7F7E`, `--brand-teal-dark`): hover/pressed state for teal actions and teal-toned text/icons on light tints.
- **Brand Teal Pale** (`#E3F6F5`, `--brand-teal-light`): icon-chip backgrounds, section tint washes.
- **Brand Blue** (`#2563EB`, `--brand-blue`): secondary accent, alternated with teal per feature row for rhythm.
- **Brand Navy** (`#0B2136`, `--brand-navy`): solid dark section background (contact/footer band).

No gradients — solid fills only. Imagery "blends" into a section via an alpha mask (radial `mask-image` fading the photo's edges to transparent) over a soft blurred solid-color tint, never a visible color-gradient glow.

### Named Rules
**The One Accent Rule (authenticated app).** Only the blue → indigo gradient signals "primary action" or "you are here" (active nav, primary buttons, focus rings) inside the authenticated console. No other hue is used for calls to action there — green/amber/red are reserved for status meaning, never for a generic button. The public site follows its own solid-teal accent instead (see Public Site Palette above).

## Typography

**Body/UI Font:** Geist Sans (`var(--font-geist-sans)`, with `system-ui, -apple-system, sans-serif` fallback)
**Mono Font:** Geist Mono (`var(--font-geist-mono)`) — reserved for the rare code/ID-style value; not used in prose.

**Character:** A single neutral, highly legible grotesque carries the entire product — no serif or display face is introduced anywhere in the build, consistent with an operational tool meant to be scanned quickly across long shifts, not read for pleasure.

### Hierarchy
- **Display** (weight 800, `clamp(1.875rem, 4vw, 2.25rem)`, line-height 1.15): page-level and hero headings (`text-3xl`/`text-4xl font-extrabold`) — login welcome, marketing hero, page titles.
- **Title** (weight 700, `1.25rem`, line-height 1.3): section and card headers (`text-xl font-bold`).
- **Body** (weight 400, `0.875rem`, line-height 1.5): default UI and form copy (`text-sm`).
- **Label** (weight 600, `0.75rem`, letter-spacing `0.05em`, uppercase where used): stat-card eyebrun labels, sidebar category headers, form field labels (`text-xs font-bold uppercase tracking-wide` / `text-sm font-semibold`).

### Named Rules
**The Single-Family Rule.** Every weight and size in the product comes from the Geist Sans ramp. No secondary or accent typeface is introduced for headings, quotes, or numerals.

## Layout

The authenticated app uses a fixed-left-sidebar shell: a 280px (or 80px collapsed) `fixed` sidebar plus a fluid main content area; the sidebar collapses via explicit user toggle, not a breakpoint. The public marketing shell instead uses a sticky top header (`h-16` mobile / `h-20` desktop) with a hamburger-driven mobile drawer below `md`.

Content containers use `container mx-auto` with responsive horizontal padding (`px-4` → `sm:px-6` → `lg:px-8`). Spacing follows the standard 4px-based Tailwind rhythm: `gap-2`/`gap-3`/`gap-4` between related elements, `p-3`/`p-4` internal card padding, `py-8`/`py-12` for page-level vertical rhythm, `space-y-6`/`space-y-8` between stacked form sections. Dashboard/stat grids use `grid-cols-2` on mobile expanding to `grid-cols-4` at `sm`.

## Elevation & Depth

The system is layered and soft, not flat and not hard-offset. Shadows are used both structurally (sticky header, sidebar tooltip, dropdown) and as a hover response (cards and buttons lift with `hover:shadow-lg`/`hover:shadow-xl`, frequently paired with a slight `hover:scale-105`). Depth is soft and diffuse throughout — never a hard, offset "sticker" shadow.

### Shadow Vocabulary
- **Ambient sm** (`shadow-sm`): sticky header at rest, subtle card resting state.
- **Hover md/lg** (`shadow-md` / `shadow-lg`): card and stat-tile hover, dropdown/tooltip surfaces.
- **Prominent lg/xl** (`shadow-lg` → `hover:shadow-xl`): primary CTA buttons and the login/marketing hero card.

### Named Rules
**The Lift-On-Hover Rule.** Interactive surfaces (cards, primary buttons, clinic-selection tiles) sit at a low shadow at rest and increase shadow + scale on hover; the increase is the affordance that the element is actionable.

## Shapes

Corners are generously rounded almost everywhere and radius scales with a surface's prominence: small interactive chrome (icon buttons, sidebar rows, toggle icons) uses `rounded-md`/`rounded-lg` (8–12px); cards, inputs, and panels use `rounded-lg`/`rounded-xl` (8–16px); prominent CTA buttons, the login card's icon block, and the BrandLogo mark step up to `rounded-2xl` (16px). Status badges, category pills, and the active-nav indicator dot use `rounded-full`. Borders are typically 1px (`border-gray-200`/`border-gray-300`) for structural dividers and step up to 2px (`border-2`) on form inputs and clinic-selection cards to keep focus/hover states visible without relying on shadow alone.

## Components

### Buttons
- **Shape:** `rounded-lg`/`rounded-xl` (8–16px), scaling up with the button's prominence.
- **Primary:** white text on the `from-blue-600 to-indigo-600` gradient (`{colors.primary}` → indigo), `px-6 py-3`/`px-8 py-4` padding, `font-semibold`.
- **Hover / Focus:** gradient darkens to `from-blue-700 to-indigo-700`, shadow increases (`shadow-lg` → `hover:shadow-xl`), and the button lifts (`hover:scale-105`); disabled state fades the gradient and removes the transform.
- **Secondary / Ghost:** plain white or transparent background, gray text, `hover:bg-gray-100`/`hover:bg-blue-50` — used for nav links and icon-only actions (edit/delete/view row actions use tinted `bg-{color}-50 text-{color}-700 hover:bg-{color}-100` per action).

### Cards / Containers
- **Corner Style:** `rounded-lg` (8px) for dense list/stat cards; `rounded-xl`/`rounded-2xl` for feature and selection cards.
- **Background:** white by default; dashboard stat tiles use a light tinted gradient (`from-{color}-50 to-{color}-100`) keyed to the metric's semantic color.
- **Shadow Strategy:** flat at rest, `hover:shadow-md`/`hover:shadow-lg` on interaction (see Elevation & Depth).
- **Border:** 1px `border-gray-200` (neutral cards) or a tint-matched border (`border-blue-200`, `border-emerald-200`) on colored stat tiles.
- **Internal Padding:** `p-3`–`p-4` for dense tiles, `p-4`–`p-6` for standalone cards.

### Inputs / Fields
- **Style:** white/translucent background, `border-2 border-gray-300`, `rounded-xl`, left-inset inline SVG icon, `py-3` height.
- **Focus:** border shifts to `focus:border-blue-500` with a `focus:ring-2 focus:ring-blue-500` glow — no shadow-based focus treatment.
- **Error:** a red-bordered, red-tinted (`bg-red-50/90 border-2 border-red-200`) message block beneath the field, with an inline warning-circle SVG icon; field border is not colored on error in the current build.

### Navigation
- **Sidebar (authenticated app):** fixed white panel, `border-r border-gray-300`, collapsible between 280px and 80px. Active item: `bg-blue-100 text-blue-900 font-medium` plus a small `rounded-full` blue dot; inactive: gray text with `hover:bg-gray-100`. Items group under uppercase gray category labels (`text-xs font-bold uppercase tracking-wider`).
- **Public header:** sticky, `bg-white/90 backdrop-blur-md`, solid dark-gray wordmark, and a solid `brand-teal` primary button ("Staff Login") distinguishing the one primary action from plain-text nav links.
- **Mobile:** header collapses to a hamburger toggling a full-width dropdown panel with the same link/CTA hierarchy stacked vertically.

### Brand Mark (signature component)
`BrandLogo` is a fixed square mark (default `rounded-lg`, stepping to `rounded-2xl` in hero contexts) on a `linear-gradient(135deg, #0EA5A4 0%, #2563EB 100%)` teal-to-blue background with a white outlined shield-and-cross glyph. Per `PRODUCT.md`, this mark, its gradient, and its placement in the login page, `PublicLayout` header, and `Sidebar` are fixed brand identity — reproduce it exactly, do not restyle it to match the blue/indigo UI gradient used elsewhere.

## Do's and Don'ts

### Do:
- **Do** use the blue → indigo gradient (`from-blue-600 to-indigo-600`, hover `from-blue-700 to-indigo-700`) for every primary call-to-action button inside the authenticated console.
- **Do** use the solid `brand-teal` accent (never a gradient) for every primary call-to-action on the public site (homepage, `PublicLayout`).
- **Do** reserve green/amber/red strictly for status meaning (active/warning/error), never as a stylistic alternative to the primary accent.
- **Do** render the `BrandLogo` mark exactly as implemented (teal-to-blue gradient, shield glyph) wherever the brand appears — it is fixed identity, not a token to reinterpret.
- **Do** pair every input with a left-inset inline SVG icon and a `focus:ring-2 focus:ring-blue-500` glow, matching the existing form pattern.
- **Do** use inline outline-style SVG icons (stroke, 1.5–2px) for all iconography; never a glyph icon font or emoji.

### Don't:
- **Don't** use gradient fills, gradient text, or gradient buttons anywhere on the public site (homepage, `PublicLayout`) — solid `brand-teal`/`brand-blue`/`brand-navy` only. This is a deliberate identity decision distinct from the authenticated app's gradient system.
- **Don't** introduce a second display or serif typeface; the entire product runs on Geist Sans.
- **Don't** apply a hard, offset ("sticker") shadow anywhere; the built system uses only soft, diffuse shadows that intensify on hover.
- **Don't** restyle the `BrandLogo` gradient to match the blue/indigo UI accent, or vice versa — the build keeps them as two intentionally distinct gradients (logo mark vs. functional UI accent) and neither should be collapsed into the other without a deliberate identity decision.
