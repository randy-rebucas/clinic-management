---
name: Clinic Management System
description: Multi-role clinic operations SaaS — scheduling, clinical documentation, billing, and inventory in one system.
colors:
  primary: "#0EA5A4"
  primary-dark: "#0A7F7E"
  primary-light: "#E3F6F5"
  primary-deep: "#086362"
  chart-teal: "#0E9594"
  chart-blue: "#2563EB"
  state-pending: "#D97706"
  state-no-show: "#BE123C"
  brand-blue: "#2563EB"
  brand-navy: "#0B2136"
  success: "#10b981"
  warning: "#f59e0b"
  danger: "#ef4444"
  neutral-bg: "#f9fafb"
  neutral-fg: "#0f172a"
  neutral-surface: "#ffffff"
  neutral-border: "#e5e7eb"
  neutral-border-strong: "#d1d5db"
  neutral-rule-soft: "#f3f4f6"
  neutral-secondary: "#4b5563"
  neutral-muted: "#6b7280"
  neutral-strong: "#111827"
typography:
  display:
    fontFamily: "var(--font-geist-sans), system-ui, -apple-system, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "var(--font-geist-sans), system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  body:
    fontFamily: "var(--font-geist-sans), system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "var(--font-geist-sans), system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "0.05em"
  figure:
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    fontFeature: "\"tnum\""
  figure-sm:
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.43
    fontFeature: "\"tnum\""
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  cell: "20px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.sm}"
  button-secondary:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-strong}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "#374151"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  nav-item-active:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.primary-dark}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  sidebar:
    backgroundColor: "{colors.neutral-surface}"
    width: "280px"
  sidebar-collapsed:
    backgroundColor: "{colors.neutral-surface}"
    width: "80px"
  header-bar:
    backgroundColor: "#ffffffe6"
    height: "64px"
  avatar-chip:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.sm}"
    size: "36px"
  period-segment-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.xs}"
    padding: "6px 14px"
  stat-tile:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-strong}"
    padding: "{spacing.cell}"
    typography: "{typography.figure}"
  icon-chip:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.primary-dark}"
    rounded: "{rounded.sm}"
    size: "40px"
  icon-chip-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.sm}"
    size: "40px"
  panel:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-strong}"
    rounded: "{rounded.md}"
    padding: "16px 20px"
  badge-status-scheduled:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.primary-dark}"
    rounded: "{rounded.xs}"
    padding: "2px 8px"
    typography: "{typography.label}"
---

# Design System: Clinic Management System

## Overview

**Creative North Star: "The Operations Console"**

This is a working console for people who spend their whole shift in it: front-desk staff booking patients between phone calls, nurses documenting a visit, billing staff closing an invoice, an admin scanning a dashboard between meetings. Every screen is an instrument panel, not a showcase: dense figures, status color at a glance, and one accent that marks anything interactive or "you are here".

The console now lives in the same brand world as the public site. The accent is the solid teal of the `BrandLogo` mark, surfaces are white on a pale gray ground, structure comes from hairline gray rules rather than shadows, and figures are set in Geist Mono with tabular numerals. Nothing carries a gradient except the logo mark itself. Hover is a quiet teal tint, not a lift. The public site (homepage, `PublicLayout`) and the authenticated app (sidebar, header, dashboards) are one system with one palette.

Every authenticated surface (the `(app)` group, the patient portal, and the medical-representative portal) has been migrated onto this system. The login page and public-only screens keep their own brand-bound treatment per `PRODUCT.md`.

**Key Characteristics:**
- One solid accent, brand teal, for primary actions, the active nav row, focus rings, and selected segments, everywhere.
- No gradients on any surface; the `BrandLogo` teal-to-blue mark is the sole gradient and is fixed identity.
- Flat, hairline-ruled surfaces at rest; soft long shadows only on floating layers (menus, drawer).
- Geist Sans for words, Geist Mono with tabular numerals for figures, times, and amounts.
- Tight corners: 6px on buttons and chips, 8px on panels and grids, 4px on badges.
- Outline SVG icons at 1.75px stroke.

## Colors

A single solid teal accent over a cool gray neutral scale, with navy for dark bands and the drawer scrim, and a fixed semantic set for state.

### Primary
- **Brand Teal** (`--brand-teal`, #0EA5A4): the brand's signal colour for non-text marks: focus rings, borders, icon chips on hover, spinners, the public site's large-type CTAs. White text on it is only 3.0:1, so it never carries small text.
- **Brand Teal Dark** (`--brand-teal-dark`, #0A7F7E): the fill of every text-bearing teal control in the console (primary buttons, the active period segment, the avatar chip, header icon chips), 4.8:1 with white; also teal text on white (links, "View all", breadcrumb hover).
- **Brand Teal Deep** (`--brand-teal-deep`, #086362): hover/pressed state for teal-dark fills, and the text colour on teal-light tints (active nav row, "scheduled" badge, info banners), ~6.9:1.
- **Brand Teal Pale** (`--brand-teal-light`): active nav row fill, resting icon-chip fill, the "scheduled" badge, and (at 40–60% alpha) the hover wash on stat tiles and quick-action cells.

### Secondary
- **Brand Blue** (`--brand-blue`): public-site secondary accent, alternated with teal per feature row. Not used as an action color in the authenticated app.

### Tertiary
- **Brand Navy** (`--brand-navy`): solid dark section bands on the public site; the mobile drawer backdrop at 40% alpha.

### Neutral
- **Console Ground** (gray-50): the app background behind every authenticated screen; page titles sit directly on it.
- **Console Ink** (`--foreground`): default body text.
- **Surface White**: sidebar, header (at 90% with blur), panels, tiles, menus.
- **Hairline Gray** (gray-200): the default 1px rule: sidebar edge, header bottom, panel borders, ruled-grid lines, period control frame.
- **Strong Hairline** (gray-300): outline of secondary buttons.
- **Soft Rule** (gray-100): row dividers inside panels, ghost hover fills, empty-state chips.
- **Secondary Gray** (gray-600): subtitles, stat labels, help text.
- **Muted Gray** (gray-500): inactive nav icons, list secondary lines, sidebar group labels.
- **Strong Gray** (gray-900): headings and figures.

### Semantic (state)
- **Success Green** (emerald family): "confirmed" badges, positive figures, active subscription dot.
- **Warning Amber** (amber family): "pending" and "rescheduled" badges, cancelled/paused subscription dot.
- **Danger Red** (red family): "no-show" and "cancelled" badges, the unread count, sign-out hover, alert icon chips and subtitles on figures that need attention.

### Named Rules
**The One Teal Rule.** Teal is the only colour that says "act here" or "you are here": primary buttons, active nav, the selected segment, focus rings. No other hue is used for a call to action or as a module's identity colour; green, amber, and red carry status meaning only, and purple/orange/cyan survive only as categorical encodings (category badges, report categories).

**The Teal Contrast Rule.** Small text never sits on bright brand teal. Text-bearing teal fills use teal-dark (hover teal-deep); text on teal-light tints uses teal-deep. Bright teal is for rings, borders, and icons.

**The No-Gradient Rule.** No gradient fills, gradient text, or gradient buttons anywhere, public or authenticated. The `BrandLogo` mark is the one exception and is identity, not a style. (Radial mask fades on public imagery and line-grid backgrounds are masks, not color gradients.)

**The Red-Means-Attention Rule.** A stat tile turns its icon chip and subtitle red only when its figure needs action (e.g. outstanding invoices above zero). Red is never decoration.

## Typography

**Body/UI Font:** Geist Sans (`var(--font-geist-sans)`, with `system-ui, -apple-system, sans-serif` fallback)
**Figure Font:** Geist Mono (`var(--font-geist-mono)`), always with tabular numerals.

**Character:** One neutral grotesque carries every word; its mono sibling carries every number a user scans or compares, so columns of times and amounts line up without effort.

### Hierarchy
- **Display** (800, 1.5rem below `sm` / 1.875rem above, tight tracking): the page title, set directly on the gray ground.
- **Title** (700, 1rem, tight tracking): panel headers and the "Quick actions" heading.
- **Body** (400, 0.875rem): UI copy, stat labels, list secondary lines, subtitles (0.875–1rem).
- **Label** (600, 0.75rem, 0.05em tracking, uppercase): sidebar group headers only; badges use the same size and weight in sentence case.
- **Figure** (Mono 600, 1.5rem / 1.875rem, tabular): stat-tile and summary values.
- **Figure small** (Mono 500, 0.875rem / 0.75rem, tabular): list-row times and dates, subscription expiry, unread count.

### Named Rules
**The Mono-For-Figures Rule.** Any figure, time, date, or amount a user compares across rows is set in Geist Mono with `tabular-nums`. Words never are. No third typeface is introduced.

## Layout

The authenticated shell is a fixed left sidebar plus a fluid main column on a gray-50 ground. On `lg` and up the sidebar is 280px, collapsing by explicit toggle to an 80px icon rail (main column margin follows, 300ms on `cubic-bezier(0.16,1,0.3,1)`). Below `lg` it becomes an off-canvas drawer opened from the header's menu button, over a navy/40 backdrop, closable by Escape or backdrop click.

The header is sticky, 64px tall, with responsive horizontal padding (`px-4` → `sm:px-6` → `lg:px-8`): menu toggle and breadcrumb on the left, notifications and user menu on the right.

Dashboard pages sit in a `max-w-7xl` centered column with `py-8`/`sm:py-10` vertical padding and a 32px gap between the title row and content, 24px between content blocks. Ruled grids step 1 → 2 → 3 columns for stats (`sm`, `lg`) and 1 → 2 → 4 for quick actions; two-panel rows go side by side at `lg`. Cells pad 20px.

## Elevation & Depth

The system is flat at rest. Depth on dashboard and shell surfaces comes from white surfaces on a gray ground and 1px gray-200 hairlines, never from shadow. Shadows appear only on layers that float above the page, and they are long, soft, and slate-tinted.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 8px 30px rgb(15 23 42 / 0.1)`): dropdown menus (user menu), small floating cards on the public site.
- **Drawer** (`box-shadow: 0 20px 50px rgb(15 23 42 / 0.18)`): the mobile sidebar drawer while open; removed on `lg`.

### Named Rules
**The Tint-Not-Lift Rule.** Interactive cells and rows respond to hover with a color wash (teal-light at 40–60% on tiles and quick actions, gray-50 on list rows) and an icon chip that fills teal. They never lift, scale, or gain a shadow.

## Shapes

Corners are tight and graded by role: badges and period segments 4px; buttons, nav rows, icon chips, the avatar, and menu items 6px; panels, ruled grids, menus, and the sidebar subscription card 8px; status dots and the unread count fully round. Borders are 1px throughout. Ruled grids are one 8px-cornered frame whose cells draw their own right and bottom hairlines, with the frame clipping the outer edge so a ragged last row stays clean.

## Components

### Buttons
- **Shape:** gently squared (6px).
- **Primary:** solid teal-dark, white semibold text, 10px × 20px; may carry a leading 16px icon.
- **Hover / Focus:** background deepens to teal-deep over 150ms; focus-visible shows a 2px brand-teal ring with offset.
- **Destructive:** solid red-600, the only non-teal filled button.
- **Secondary:** white with a gray-300 hairline, gray-900 semibold text, border darkens to gray-900 on hover.
- **Ghost / icon:** transparent, gray-500/600 icon, gray-100 fill on hover.

### Period Control
A segmented control in a white, gray-200-framed 6px container with 4px padding. The active segment is solid teal-dark with white text (4px corners); inactive segments are gray-600 text, gray-100 on hover. Exposed as a group of `aria-pressed` buttons.

### Stat Tiles
- **Container:** cells of a hairline-ruled grid (white cells, gray-200 rules), 20px padding.
- **Content:** gray-600 label, Mono figure below, optional subtitle (gray-600, or red-700 when it needs attention).
- **Icon chip:** 40px, 6px corners, teal-light with teal-dark icon; fills solid teal with a white icon on tile hover. Alert tiles use red-50/red-600, filling red-600 on hover.
- **Whole tile is a link**; focus shows an inset teal ring over a teal-light wash.

### Panels and Lists
- **Panel:** white, 8px corners, gray-200 border, no shadow; header row 16px × 20px with a bottom hairline, title left, teal-dark "View all →" link right.
- **List rows:** `divide-y` gray-100, 14px × 20px rows; name semibold gray-900 with a gray-500 secondary line; right column holds a Mono time/date and a badge. Hover is gray-50.
- **Empty state:** centered gray-100 icon chip, semibold title, gray-500 hint.
- **Error state:** red-50 icon chip, short plain explanation, primary "Try again" button.

### Status Badges
Small 4px-cornered labels, 0.75rem semibold, with a 1px inset ring of the same family: scheduled teal (teal-light / teal-deep), confirmed emerald, pending and rescheduled amber, no-show and cancelled red, completed gray.

### Data Lists (roster pattern)
The patients page sets the pattern for record lists: a title row with secondary actions (white, gray-300 outline) left of one teal-dark primary; a toolbar of search (leading icon), sort select, and a Filters toggle carrying a Mono count; active filters as teal-light removable chips with "Clear all". The list is one 8px panel with a gray-50/60 column-header row and `divide-y` rows (initials chip, name link with search-match highlight in teal-light, Mono code), a footer with Mono "1–20 of 340" and windowed pagination (teal-dark current page). Row actions are ghost icon buttons at 60% that firm up on row hover or focus; delete turns red only on hover. Selecting rows raises a navy **selection tray** (sticky bottom, Drawer-weight shadow) with count and bulk actions. First load shows skeleton rows; refetches dim the list to 60%.

**Workflow rows (appointments).** When a row moves through states, its actions are the *next step* as one labelled secondary button (Confirm → Move to queue → Mark seen) followed by quiet 1.75px ghost icon buttons for the rest (no-show, cancel), each with an `aria-label` naming the patient. Cancel turns red only on hover and always asks first in an AlertDialog that says what follows (the slot may go to the waitlist); dialogs opened from a row are portalled to `body` so the row's entrance transform cannot trap them and their clicks never count as a row click. A 10px state swatch beside the Mono time ties each row to its block on the schedule board. Actions the user's role cannot perform are not rendered (permissions come from the server page).

**Whose records (visits).** A list a clinician mostly reads for their own work carries a "Whole clinic / Mine" segmented control (Period Control styling) in the title row. It defaults to Mine for doctors and Whole clinic for everyone else. The insights strip follows the same scope, and its labels say so ("Your notes still to finish"). An empty Mine list offers "Show the whole clinic" instead of a dead end. Mine is enforced by the API (`mine=true` → the signed-in user's records), never by hiding rows on the client.

**Live lists (queue).** A list that changes without the user refreshes every 30 s only while the tab is visible (and at once when it becomes visible again), shows "Updated 9:41 AM" in Mono beside a refresh icon button, and dims to 80% (not 60%) during a poll so the page doesn't pulse. Elapsed waits are Mono durations that turn amber-800 from 30 minutes and red-700 from 60 with a "Long wait" label, so colour is never the only signal. A failed poll keeps the last good list under an amber "showing the queue as of …" line instead of blanking it. Queue order is one rule shared by the list, the waiting-room screen and patient notifications (`lib/queue-order.ts`): higher priority first (urgent 2, high 1, normal 0), then arrival.

**Record pages (visit detail).** A single record's page puts the patient's name in the title with the status badge and the record code in Mono beside it, and a plain subtitle (type · date at time · doctor). Actions sit right of the title: printouts and state changes as secondary buttons, one teal-dark primary (Edit note), destructive as a quiet icon. A state change with consequences outside the page (closing a visit bills the patient and messages them; cancelling also cancels their queue place) always asks first in an AlertDialog that lists those consequences in plain words, and says when something is missing (an unsigned note). Content is a two-column grid at `lg` (`1.6fr / 1fr`): the record itself in panels on the left, and on the right who it belongs to, a "From this visit" panel of everything the record produced elsewhere (prescriptions, lab tests, invoice, follow-up — each a linked row with its code and its state in words, each group shown only to roles that may read that module), and the signature. Successes and failures report in a dismissable status line under the title, never `alert()`.

### Quick Actions
Mirrors the public homepage quick-access grid: a 4-column hairline-ruled grid of linked cells, each with a teal-light icon chip that fills teal on hover, a semibold title, and a gray-500 one-line description.

### Navigation
- **Sidebar:** white, gray-200 right hairline; 64px logo row with `BrandLogo` (32px) and wordmark. Items group under uppercase gray-500 labels. Rows are 6px-cornered, gray-700 medium text with gray-500 18px icons; hover gray-100. Active row: teal-light fill with teal-deep semibold text and a teal-dark icon, no side stripe, no dot. The collapsed rail shows icons only with a dark gray-900 tooltip on hover. A subscription card (8px, hairline) sits at the foot with a semantic status dot.
- **Header:** sticky white at 90% with `backdrop-blur-md`, gray-200 bottom hairline. Breadcrumb in gray-500 links (teal-dark on hover) ending in a gray-900 current page. Notifications icon button turns teal-light/teal-dark (icon only) when active, with a red Mono unread count. User button shows name and role, then a 36px teal-dark avatar chip (6px corners, white initials); its menu is an 8px white panel with the Float shadow.
- **Public header:** sticky `bg-white/90 backdrop-blur-md`, solid teal "Staff Login" primary button among plain-text links.

### Inputs / Fields
White fields with a gray-300 hairline and 8px corners. Focus is a 2px brand-teal ring (`focus:ring-brand-teal`) with the border going transparent or teal; errors keep a red ring and a red-50 message block. No field uses a non-teal focus colour.

**Hand-over records (prescription).** A record that is handed over in parts lists its items as numbered ruled rows (name, form in gray-500, directions in gray-900, instructions in gray-600) with the progress at the right: a Mono line in words ("10 of 21 given", "All 21 given", "No quantity set") over a 6px Chart Teal meter on a gray-100 track (`role="meter"`), and the panel header says "2 of 3 given". Recording a hand-over opens a dialog with one Mono number field per item, each pre-filled with what is still to give, so the common case is one click and a part hand-over is lowering a number; items already complete are shown disabled. Stock notes returned by the server stay on screen as an amber list until dismissed. The patient's allergies sit under the subtitle, as on the patient record.

**Order forms (lab tests).** Ordering several things at once is one form: a ruled list of items (the record-form row pattern) above a section titled "For every test on this order" that holds what they share (urgency as a segmented radio group, fasting, instructions, outside lab). Above the rows, "Often ordered here:" shows the clinic's most-ordered items as small outline buttons that add a row (or fill the first empty one) and turn teal-light with a check once on the order. An item already waiting for this patient gets an amber line under its row with the code and date; it never blocks. The patient summary rail sits beside the form at `xl`. Each item is its own record, sent one by one; on a part failure the placed ones are listed with links and only the failed ones stay on the form. Success replaces the form with a confirmation list (check chip, name, Mono code, a "Request form" print button per row), then "Order more tests" (same patient) and the patient's record.

**Money records (invoice).** The record-page pattern with the money in plain sight. Charges are ruled rows (item, Mono qty × unit price, Mono amount at the right) over a totals list in the order the arithmetic runs: services, each discount (−, with its percentage), professional fee (with the doctor), tax, then a ruled Total. Payments are rows newest first (method, Mono amount, Mono date and time, who took it, reference and OR numbers). The side column opens with a **balance panel**: "Still to pay" as a Mono figure in red-700 (red because it needs collecting), "₱X of ₱Y paid" over a 6px Chart Teal meter, and a line naming anything else the patient still owes, linked to the list already filtered. The one primary is **Record payment**; it opens a dialog whose amount starts at the whole balance (paying in full is one click), with the methods as a segmented radio grid, the method's own reference label (GCash reference, approval code, LOA), and for cash an optional "cash handed over" that shows the change to give (not stored). Receipts print only once money has been received. Refunding is a quiet icon behind an AlertDialog whose wording differs for a paid and an unpaid invoice.

**The live bill (invoice form).** The order-form frame, with a sticky **Bill** rail beside it at `xl` that recomputes on every keystroke with the same function the API stores (`lib/invoice-totals.ts`), so the total shown is the total saved. Under it the patient's account: what earlier invoices still owe (amber, linked). Services come from a price-list combobox (adding the same service again raises its quantity); a charge not on the list is an "Add …" row. Discounts the patient qualifies for (senior by ID or by age, PWD, membership) appear as one-click outline buttons that turn teal-light with a check once applied, and each discount row says in Mono what it actually takes off after clamping. A visit that already has an invoice gets an amber line with its number; it never blocks. Saving lands on the new invoice with a confirmation, ready for the payment.

**Stock records (inventory item).** A record whose number changes every day. Under the title (name, status badge, Mono SKU; subtitle kind · where it is kept · supplier) a ruled **summary strip** answers on hand (with the stock bar), how long it lasts (days at the last 30 days' use: dispensing plus "used in the clinic"; red-700 under a week), when it expires (amber within 30 days, red once past, "stock outlasts it" when use is too slow), and value at cost. Stock never changes from the edit form: it changes only through **Restock** (the one primary; quantity starts at the usual order, cost and supplier at what is on file, a batch expiry, and for an expired item a pre-ticked "take the expired units off first") and **Adjust or count** (Take off / Add / Count as a segmented control; every change needs a reason from a fixed list), so each change is a line in the item's **History** (what happened, the reason or linked prescription code, who and when, Mono ±change and the stock after it). Expired stock still on the shelf raises a red banner with a one-click "Take them off" that opens Adjust pre-filled. The old /restock and /adjust addresses open those dialogs on the item's page.

**People records (doctors).** A staff roster is small, so the list loads whole and filters on the client; its insights strip answers who is in today (names with Mono hours and today's bookings), who is on the roster (status bar as a filter), and which specialties are covered (ranked bars as a filter). Views sit in a proper tablist (Doctors / Week / Workload, the last only for admins and accountants). The record page's summary strip shows Today (hours, or "Time off"/"On leave" in words), bookings over the next 14 days with a 14-column load mark, and, for admins, accountants and the doctor themselves, seen and collected over 30 days. Hours are a ruled weekday list with a shift bar; time off is its own list of dated rows (away all day, or "Working 1 PM–5 PM instead of 9 AM–5 PM"), each warning in amber when appointments are still booked that day. Whoever manages doctors edits anyone's hours; a doctor edits their own. A profile with appointments, notes or prescriptions is never deleted (the API refuses and says to mark the doctor inactive); internal notes reach only people who may edit profiles.

**File records (documents).** A stored file's page puts a gray **kind mark** (a 44px gray-100 tile with the file type in Mono: PDF, IMG, DOC, XLS; never a colour per type) beside the title, with Archived / Staff only badges and the Mono code. A preview panel streams the file through the audited route and says so ("Opening it is recorded in the audit log"). Two things are always stated in words, never left to inference: **whose it is** (an amber "Not filed to a patient" banner with a one-click "File to a patient" until it is) and **who can see it** (a panel saying whether the patient sees it in their portal, with a one-click "Make it staff only" / "Let the patient see it"). Uploading uses a dashed **drop zone** (gray-300, 2px dashed, teal-dark border and teal-light wash on drag or hover) that turns into the chosen file with its name, Mono size and an image preview; the kind is a wrap of outline radio chips (checked = teal-dark fill); the save bar says where the file goes and whether the patient will see it. Rows carry the same kind mark at 36px, "Not filed to a patient" in amber-800, and expiry in words (amber within 30 days, red once past).

**Referral records.** A referral is read as a route: the subtitle and every row say "From → To" in words (Dr. Reyes → St. Luke's · Cardiology), with the direction named in gray beneath (Within the clinic, Sent out, Came in, From a patient). Direction is derived from the stored fields (`lib/referrals.ts`), never stored twice. The form asks it first, as four **radio cards** (a 2×2 grid of gray-300 outlined cards, each a semibold title over a one-line gray-500 hint; checked = teal-dark border on a teal-light/40 wash), and shows only that direction's fields; use radio cards for any closed choice whose options need a sentence of explanation, segmented controls when a word is enough. The record page answers "where is it?" with a **Progress** panel: ruled steps (Referred, Accepted, Seen; or Declined with its reason quoted; Cancelled) each with a 10px dot (teal-dark done, red-600 declined, gray-400 cancelled, gray-300 ring not yet) and a Mono date and time, then the booking (linked, or "found in the schedule" with the receiving doctor) and the visit it was seen at. Actions are one step at a time: Accept / Decline (reason required) while waiting, Mark seen (date, optional visit) once accepted; for a referral sent out they read "They accepted / They declined", because staff are recording someone else's answer. A declined referral raises a red banner saying the patient still needs a place, with "Refer them somewhere else". Referrals the clinic sends print a sealed **referral letter** (reason, clinical summary, allergies, current medicines, signed with the referring doctor's licence). Waiting time reads in Mono; amber-800 "Long wait" past 7 days (when urgent ones are escalated by email), red-700 past 14.

**Membership records (loyalty).** The list opens with three answers: members in date by tier (tier marks over ranked bars, as a filter), renewals due in 30 days (with the ones that lapsed without renewing named in red-700, each a filter), and the points members hold (with what was added and used in the last 30 days, and the highest balances). The record page states in words what the membership does on a bill today ("15% off every bill", or the discount struck through with "Not offered until it is active again"), and a lapsed, suspended or due membership raises a banner whose one button is the fix (Renew / Reactivate). Points live in a **Points history** ledger: what (Added / Used / Corrected · reason), Mono date and time, who recorded it, the Mono ±change and the balance it left. Points change only through one dialog (Add / Use, plus Correct for managers, as a segmented control; a required reason with suggestion chips; "Leaves 1,250 points" in the footer). Renewing adds a year from the end date (or today once it has passed) and is a one-click confirm; tier changes use radio cards with each tier's discount and benefits. The invoice form offers the member's discount as one of its quick discounts while the membership is in date, and says why it doesn't when it isn't.

**Inbox (notifications).** A personal list, so no chart: the subtitle says how many are unread, an All / Unread segmented control (Period Control styling, Mono count) and outline kind chips that appear only for kinds with something unread (Mono count; checked = teal-light with teal-dark border) are the whole toolbar. Items sit in day groups ("Today", "Yesterday", weekday, then dates), each group one ruled 8px panel. An unread row has an 8px teal-dark dot, a semibold gray-900 title and gray-700 message; read rows drop to medium gray-700 and gray-500. Above the title: the kind in words, "Urgent" (red-700) or "Important" (amber-800) with an alert icon, and the Mono time. The whole row opens the record it is about (its link, or the record it names) and marks it read; mark read/unread and remove are quiet icons at the right (remove red on hover). Changes are optimistic, reverted with a red line if the server refuses, and the header bell's count follows at once. Older items load with "Show older", never a page-number pager.

**Administration (overview and section bar).** The admin area has no second sidebar: a white **section bar** sits under the app header (gray-200 bottom hairline, one row of text links that scrolls sideways on phones; the current section is teal-deep semibold over a 2px teal-dark underline, the rest gray-600 with a gray-50 hover). The overview opens with **Needs your attention**: ruled rows worked out on the server, red first (things that stop staff working: plan ended, a limit reached, the database not answering), then amber (worth doing this week: plan ending, two-step verification missing on an administrator, invites that ran out, accounts unused for 60 days), each with an alert chip in its family, the problem in its 700/800 shade, a gray-600 line of detail and one teal-dark link that names the fix. When nothing qualifies it collapses to one line, "Nothing needs you right now". Below it: a figure row (accounts that can sign in, signed in in 7 days, two-step verification "n of m", refused access), sign-ins per day as Chart Teal columns with refused access as a Chart Blue line on one count axis, and the plan's **usage meters** (label, Mono "12 of 50", a 6px bar on a gray-100 track: Chart Teal, pending amber from 80% with "n% used", no-show crimson at the limit with what it now blocks in words; "No limit on this plan" instead of a bar). Outside services are stated as what this server has, never as a made-up health percentage: the database is pinged ("Answered in 12 ms", Working / Not answering), email, SMS and file storage read "Set up" (emerald dot) or "Not set up" (gray ring) with what that means for patients. Every figure comes from the records (`lib/admin-overview.ts`), loaded on the server, with times written in the clinic's zone.

**Access lists (users).** A login account has one derived state, said in words everywhere (`lib/users.ts`): Can sign in (emerald badge), Invite waiting (white + gray outline, with "Link works until …"), Invite ran out (amber, "Link ran out …"), Suspended (gray fill), Closed (white, gray text; the row's name drops to gray-600). The roster pattern adds a person column with a gray initials chip and a "You" mark, two-step as On / Off (amber), and last sign-in in Mono words ("Today, 9:41 AM", "12 days ago", "Never"), amber with "Not used in 60 days" when idle. The only row button is the safe next step (Send invite again); everything else lives in an **account dialog** opened from the row: Role as compact radio cards (name over the role's description) with "They'll be signed out…" beside Save, Signing in (facts list, then reset link / sign out everywhere), Access (Suspend, Reactivate, Close account, Reopen; Close is the only one that turns red, and only on hover), and a link to the staff profile. A consequential step replaces the dialog body with a confirmation that says what follows, with an optional "Reason, for the audit log" field, and Back / one confirm button (red only for closing). You never manage your own access here; your row says so and links to Sign-in & security.

**Employment and access (staff).** A staff profile carries two states that are never merged: employment status (Active / On leave / Inactive, the doctors' badges) and the sign-in account's state (the Users badges, or "No sign-in account" in amber-800). Changing one never silently changes the other: when an edit moves someone to On leave or Inactive (or back to Active), the status section offers the matching access change as a ticked, plainly worded checkbox ("Close their sign-in too", "Suspend their sign-in while they're away", "Let them sign in again"), applied through the same audited rule as the Users dialog (`lib/account-status.ts`). The insights strip's third cell names the gap that matters, "Inactive, but can still sign in", in red-700 as a filter. A row can be removed only while its account has never been used (a mistaken entry); anyone else is marked inactive, and the API refuses the delete with that advice. The roster is small, loads whole and filters on the client (the people-records rule).

**Permission lists (roles).** What a role allows is shown as the questions people ask, never as a resource × CRUD grid: ruled rows grouped by area (Patients and care, Front desk, Billing and stock, Clinic setup), each one checkbox and a sentence of what it lets someone do ("Refund invoices"), with a Mono "8 of 21 allowed" in the group header. Only permissions the app actually checks are listed (`lib/roles.ts`), so no box does nothing. Access built into a role is a disabled checked box with a lock and "Built in"; otherwise the row's right side says which other roles have it ("Also: Doctor, Nurse"). An unsaved change tints its row teal-light/25 and says "Will be allowed" (teal-deep) or "Will be taken away" (amber-800); the floating save bar counts them and names who is affected. Roles are a master list beside the editor (name, Mono people count, a 6px Chart Teal breadth meter with "31 of 46"; administrators read "Everything" and their page is read-only). Saving sends the version it started from, so a concurrent edit is refused with a Reload, not overwritten. Access granted to a person directly is listed under the role as "Extra access of their own", so the page never under-states what someone can do.

**Price lists (services).** A catalogue that something else bills from shows what it actually does, not just what it holds. The list loads whole and filters on the client, grouped under ruled category headers (gray-50/60, Mono count) when sorted by category; each row carries the Mono price with its unit beneath, and, for people who may see billing, "12 times · ₱6,000.00 / Last billed 3 days ago" from the last 90 days of invoices (refunds left out), or "Not billed in 90 days" (only for services older than the window). The insights strip answers what is on the list (categories as Chart Teal ranked bars that filter, "Taken off the list" as a filter), what was billed (amount, top four as plain bars, "Not billed in 90 days" as a filter) and what was **typed in by hand** instead (charges with no service behind them, each with its usual price and an outline "Add" that opens the add dialog pre-filled). Below it a **rule panel** states an automation's outcome per case in ruled cells: "When a visit is closed" lists every kind of visit with the consultation it will bill, the Mono price and how it was chosen ("Set on the service" / "Matched by its name"), or amber "Nothing set: bills a fixed ₱500" with "Set a fee"; it is computed by the same function the automation runs (`pickVisitFee` in `lib/services.ts`), so the page cannot disagree with the bill. Removing is "Take off the price list" (soft, reversible with "Put back"), never red, and its confirmation lists which visit fees change and to what. A price change says in the dialog that invoices already made keep the old price; every change is audited with old and new values.

**Places (rooms).** Whether a room may be used and whether someone is in it are two facts, never one stored field: the stored status is what staff decide (Open / Under maintenance / Closed, a segmented control with a one-line consequence), and "In use now" is worked out from the queue (a patient in consultation holding the room), shown as a teal-light badge with the Mono queue number, doctor and start time, never the patient's name. Badges: Free emerald, In use now teal-light/teal-deep, Under maintenance amber, Closed white + gray outline; a row in use carries the teal-light/25 wash. Where a related record writes the place as free text (a booking's room), the page matches it by name or number and lists what matches nothing as "Written on bookings, not on this list" with an outline "Add" that opens the add dialog pre-filled (the services page's typed-charges rule). A closed room still named on bookings from today on says so in amber-800, on the row and in the dialog. A plain line under the insights states how rooms reach patients, from the settings that decide it, with a link to change them. A room the queue has ever used is never deleted (the API refuses and says to close it); only a never-used one shows a remove icon, behind a red AlertDialog.

**Settings that do something (clinic settings).** A settings page offers only settings something in the app reads; a stored field nothing reads is left off the page, never shown as a switch that does nothing. Each setting says where it shows up or what it changes ("Printed on official receipts", "Above 0, every invoice is taxed at this rate and staff can't type a tax amount"), worked out from the code, and says what's missing when it can't take effect (amber: "Text messages aren't set up on this server, so no reminder goes out"). One scrolling page of account-style sections (label column + bordered panel) with a sticky "On this page" index at `lg` that marks sections with unsaved changes ("Changed", teal-deep), and one floating save bar (Float shadow, `motion-tray-in`) counting the changes and naming the sections; Discard puts everything back. Saving sends only what changed plus the version it started from, so a concurrent save is refused with a reload message; every change is audited with old and new values. A binary setting with immediate meaning is a **switch** (`role="switch"`, 44×24 track, teal-dark when on, gray-300 off, white knob, 150ms) on a ruled row: semibold label, gray-500 hint, the switch at the right; a choice with two or three named options stays a segmented control. **Automations** are listed by group with "8 of 10 on" in Mono in each header; each row says what it does in one sentence (who gets what, by which channel) and when it runs, with cron times converted to the clinic's zone; a risk worth knowing (deletes records, books without asking, messages many patients at once) is an amber line shown while the switch is on; an unsaved row carries the teal-light/25 wash and "Will be turned on/off". **Opening hours** are a ruled week: day, switch, two Mono time fields, and a 6px Chart Teal shift bar on one scale for the whole week (at least 7 AM–7 PM), with the week's open days and hours in a header line and "Copy Monday to Tuesday–Friday" while they differ.

**Picking lists (medicines).** A list that other screens fill forms from is shown by what it fills in. Each row's middle column, "When a doctor picks it", reads the usual dose · how often · how long in plain text (with "+ 3 doses by age or weight" beneath), or amber-800 "No usual dose set" with an alert icon; that gap is also an amber filter row in the insights. The dialog's **pick preview** (a gray-50/60 hairline box under the fields) says in words what the prescription form and visit note will fill in, and runs the same frequency parser the prescription form counts quantities with (`timesPerDay` in `lib/dosage-calculator.ts`): "counts 3 doses a day, so 21 for 7 days", or an amber line when it can't read the wording and will count one a day. Doses by age or weight are ruled sentence rows ("Ages [2] to [12] years, [10] to [30] kg" over dose / how often / most a day), checked top to bottom as the form does. The insights strip follows the services rule: what is on the list (largest categories as Chart Teal ranked bars that filter; the rest in the category menu, which lists every category on file with its count), how often it was prescribed (90 days of prescriptions, a line counting for a medicine by its link or by its exact name; top four as plain bars; "Not prescribed in 90 days" and amber "Prescribed, but no stock item" filters), and **written in by name**: prescribed names that match nothing on file (name, generic or brand), each with an outline "Add" pre-filled with the name and the dose and frequency it was written with. Stock shows per row for people who may see it (Mono quantity and unit over its state in words, linked to the stock item). A controlled substance carries a gray-outline "Controlled · schedule" badge; over-the-counter is said in the row's gray line, since needing a prescription is the norm. Removing is "Take off the list" (soft, "Put back"), never a delete: prescriptions and stock items point at the record.

**Activity records (audit log).** Each entry reads as one sentence that starts with the person: "Dr. Reyes opened a patient record for Juan Dela Cruz", "Ana Cruz couldn't sign in" (`actionPhrase` in `lib/audit-log.ts`), never as action/resource codes or raw ids; descriptions that only repeat the action with an id are hidden. Rows sit under clinic-day headings (gray-50/60, "Today · Sunday, October 18") with the Mono time, the person (name, role beneath; "You"; "Someone no longer on file"), the sentence with the patient linked, and where from (Mono IP over "Chrome on Windows"). A refusal or failure is a small red badge in words ("Refused", "Didn't go through") with the reason in red-700 beneath ("Wrong password"); rows are never tinted. The chevron (or the row) expands the whole entry in place, not in a modal: full time with seconds in the clinic's zone, who, the patient, the record with "Open it", where from with the full user agent, the request, and **What changed** as a ruled Field / Before / After table (empty values read "empty", booleans Yes/No). Each fact offers its own narrowing ("Only their entries", "Only entries about them", "Only this record"). The insights strip answers what happened in 30 days (count and a `TrendChart` day picker), what was done (six plain kinds as ranked filter bars, then Refused access and Sign-ins that failed in amber-800 when above zero), and whose records were opened (distinct patients, by how many people, "Opened the most" as ranked filter bars). A patient picker in the toolbar turns the list into that patient's access history, said in a line beneath it. Download CSV takes the same filters and is itself recorded.

**Copies (backups).** A page whose records are copies of everything says plainly what a copy protects against ("stored in the same database… protects against mistakes, not against losing the database") and what it leaves out (passwords, sign-in codes, device tokens). Three figures: last backup in words ("12 days ago", amber-800 past 30 days or "None yet"), how many are kept and their Mono size, and the newest one's size against the in-app limit as a 6px meter (Chart Teal; pending amber from 80% with what to do instead; no-show crimson at the limit). Rows say what a backup holds in the clinic's words ("120 patients · 340 visits · 98 invoices · 9 other kinds of record"), never collection names; Download is the row's one secondary button, delete a quiet icon behind a red AlertDialog that says downloaded files are unaffected. Making one is a small dialog with an optional "What it's for".

**Claims to a payer (HMO claims).** Money owed by a third party moves through three places, one tab each: **To send** (bills charged to a payer, grouped by payer, ready ones pre-ticked with a select-all per group), **Transmittals** (the roster pattern, waiting views sorted oldest sent first, each row saying when payment is due in words: "Due in 5 days", red-700 "12 days past due"), and the payers themselves (terms, the tax they usually withhold, what each owes and how long it actually takes to pay, amber-800 when slower than its terms). The insights strip answers what hasn't gone out (ready vs waiting for an LOA vs payer not on the list, in amber-800), what payers owe by days since sent (Chart Teal bars that filter, past due named in red-700 as a filter), and who owes it (ranked bars per payer that filter). A group whose payer was typed by hand is never a dead end: it carries "Add “X” to the list" (the add dialog pre-filled, its claims linked once saved) and "it's already there as [payer] · Bill them to it". When a draft to that payer exists, the group's primary adds to it ("Add 3 to TR-000012") and "New transmittal" is secondary. A claim waiting on the payer **holds its bill**: the bill's amounts can't change and it can't be refunded until the claim is taken out of the draft or the payer's answer is recorded (`claimHold` in `lib/hmo-claims.ts`), and a claim its bill no longer supports (refunded, paid since) is flagged in amber on the transmittal and blocks marking it sent. Transmittal states follow the meaning map: Draft white + gray outline, Sent teal-light, Part paid amber, Settled emerald, Closed white + gray; a claim reads Waiting, Paid, Part refused (amber-800, with what the patient now owes) or Refused (red-700, with the reason quoted).

**Claims against a deadline (PhilHealth).** When the payer sets a filing window, the list is sorted by the date to file by and each row shows it in Mono over the days left in words ("12 days left", amber-800 within 7 days, red-700 "3 days past the deadline"); the insights bar the claims by deadline (Past the deadline / within 7 days / 8–30 / later, as filters) beside filed claims by days waiting (filters) and what was paid in 90 days with the real filing-to-payment time. A claim sent back for correction gets PhilHealth's fixed 60 calendar days from receipt of the notice (`RTH_DAYS`, PhilHealth Circular 2026-0013 §V.E.13; the date is entered, never guessed) and its row quotes what was asked ("PhilHealth asked: …"). The row's one labelled button is the next step (Mark filed / Record payment); returned and denied are quiet icons whose dialogs say what follows ("The other ₱1,200 stays on the bill for the patient"). Not filing at all is worded as a choice ("Don't claim it"), never as a denial. A payment below the claim is **Part paid** (amber badge, its own filter, "Paid less than claimed · ₱X short" in the figures), never quietly Paid; the shortfall stays on the patient's bill and says so. A download that carries members' ID numbers is made on the server and recorded in the audit log.

**Week roster.** One clinic week (Sunday to Saturday, the reports' week) as a real table: a sticky doctor column, one column per day. A working day shows its hours in Mono over a **shift bar**: a 6px Chart Teal bar on a gray-100 track, all on one scale (the clinic's opening hours across the week, widened to fit any shift), so a late start or short day reads at a glance. Changed hours say "Changed: reason" in amber-800; time off reads "Time off" with its reason; a doctor on leave is one merged row saying so. Bookings sit under the hours in words ("6 booked", past days "5 seen of 6"; "3 still booked" in amber on a day off). Past days carry the gray-50 wash, today a teal-light/25 wash and a 2px teal-dark mark under its header. Week arrows and a "This week" button move it; counts come from one aggregation (`/api/doctors/roster`).

**Reports.** One page, one report at a time: a tablist of only the reports the person may open (the same rule the report routes enforce, `lib/reports.ts`), then one period control shared by every report that has a period (This week / This month / Last month / Dates… with two Mono date fields, at most three months) and a secondary **Download CSV** at the right. A report that describes "now" (HMO claims) replaces the period control with a plain line saying so. Each report opens with a ruled row of four headline **figures** (label, Mono figure, a one-line note that turns red-700 only when it needs attention), then the dashboard chart components (`TrendChart` per day, `RankedBars` for breakdowns) in Panels whose subtitles say exactly what is counted ("Payments count on the day received…"). The covered dates sit in Mono above the figures. A refetch dims the report to 60%; a different report never renders under the newly chosen tab.

**Result records (lab result).** Values read as a ruled table (Test · Result · Reference range · Last time). Results are Mono; a value outside its range is red-700 semibold with the word "High" or "Low" beside it, so colour is never the only signal, and the panel header counts them ("2 values outside range"). The flag is the one stored with the result, or worked out from the value and a numeric range ("12–16", "<5") when none was stored. "Last time" is the patient's newest earlier result for the same test, with its date. Values are entered in place (the panel turns into a ruled editor: test, result, range, flag that sets itself when value and range are numbers), pre-filled with the test names and ranges from that earlier result; saving a result still at the lab marks it in and says so in the footer beforehand. Lab reports open through an audited streaming route, never as data URLs. Telling the patient is a small dialog of contact choices that shows the number or address each will use and disables the ones not on file.

**The patient record.** A person's page follows the record-page pattern with three additions. Allergies sit in the header under the subtitle on every visit to the page (severe ones red-700 with the severity in words; an empty list reads "none on file", never "no known allergies"). Under the header a ruled **summary strip** answers the four first questions (last visit, next appointment, lab tests outstanding, balance due), each cell present only for roles that may read that module, the balance red only when something is owed. Related records live in one **Record** panel with a proper tablist (arrow keys, Home/End): "Everything" merges the newest items of every kind by date with a gray kind label; each other tab shows the true total in Mono and, when it lists fewer, a "Newest 25 of 140" footer. Files are opened through an audited route that streams them (inline only for images, PDF and text), never as data URLs.

**Long forms (the visit note).** A form a clinician fills during a consultation is one scrolling page of section panels (white, 8px, hairline header with a title and a one-line gray-500 hint), never tabs that hide fields. Repeating rows (diagnoses, medicines) are ruled lists with an "Add …" secondary button at the foot and a quiet remove icon (red only on hover). Problems are shown only after the first save attempt: the field gets a red-400 border and a red-700 message with an alert icon beneath it, the first one takes focus, and the save bar says how many need fixing. Saving lives in a **floating save bar** (sticky to the bottom, 8px, Float shadow, rising in with `motion-tray-in`) holding a plain status line on the left (what saving will do — "Saving makes a prescription for 2 medicines" — or "Draft saved", or the problem count) and Cancel, Save draft and one teal-dark primary on the right. Beside the form at `xl`, a sticky **patient summary** rail puts allergies first (severe ones in red-700 with the severity in words), then conditions, current medicines, labs still out and the last three visits (links open in a new tab so the note is never lost); the same allergies repeat as an amber line above the medicines.

**Record forms (patient registration and edit).** Same frame as the long form (section panels, floating save bar, problems shown only after the first save attempt, first one focused) in a `max-w-5xl` column. Required fields carry no mark; optional ones say "(optional)" in gray-500 after the label. A short closed choice (sex) is a segmented radio group in the Period Control style (white, gray-300 frame, checked segment teal-dark with white text), not a select. Repeating rows (allergies, conditions, family history) show gray-500 column headings at `sm` and up and per-field labels below it, with the "Add …" button at the foot and a "None on file." line when empty. Personal-data forms set `autoComplete="off"` so the browser never fills in the staff member's own details. While registering, a possible match already on file (same name, last name + birth date, or phone) appears as an amber notice after the contact section, with each record linked in a new tab and the reason in words ("Same name and phone number"); the save bar repeats it. It never blocks saving. Server validation issues land on their fields; a failed save never clears the form.

### Alerts and Banners
A 1px tinted border on a 50-tint fill (red / yellow / green / teal-light), 8px corners, an outline status icon, and text in the family's 800 shade (teal-deep for info). No thick coloured side stripe and no resting shadow.

### Brand Mark (signature component)
`BrandLogo` is a fixed square mark (8px corners in the sidebar and header, larger in hero contexts) on a `linear-gradient(135deg, #0EA5A4 0%, #2563EB 100%)` background with a white outlined shield-and-cross glyph. Per `PRODUCT.md` it is fixed brand identity: reproduce it exactly.

## Data Visualization

Charts are hand-drawn SVG/HTML in `components/dashboards/charts.tsx`, not a charting library, so they speak the console's grammar: hairlines, mono figures, flat marks.

### Palette (validated with the dataviz checker, light and dark, all pairs)
- **Series pair:** Chart Teal `#0E9594` (brand teal one step deeper so marks clear 3:1 on white) and Chart Blue `#2563EB` (the public site's brand blue). Tritan separation is 6.8, so the pair is only used where the two series also differ by mark: columns vs. line, or area vs. line.
- **Appointment state:** upcoming Chart Blue, seen Chart Teal, pending/rescheduled `#D97706`, no-show `#BE123C`. Cancelled is outside the hue set: white fill, gray-300 inset ring, struck-through label. Text inside a state fill is white on blue and crimson, navy ink on teal and amber.
- Single-series charts (payment methods, receptionist bookings) use Chart Teal and no legend; the panel title names the series.
- **Records with more states than hues** (visits, prescriptions) map onto the appointment-state hues by meaning: not started / waiting = Chart Blue, partly done or unfinished = pending amber, done = Chart Teal. Terminal-but-neutral states sit outside the hue set: **completed** = gray-200 fill + gray outline, **cancelled** = white + gray outline (+ strike on the row). A mid-gray fill was tried for completed and failed the checker against teal (deutan ΔE 5.4, normal-vision 11.1), so neutral states are told apart by fill lightness and label, never by a gray "hue".
- **Invoices** follow the same meaning map: unpaid = waiting (teal-light badge, Chart Blue fill), part paid = amber, paid = emerald badge / Chart Teal fill, refunded = white + gray outline (+ strike on the row).
- **Aging as a filter (invoices).** What is still to collect is split by days since billing (under 31, 31–60, 61–90, over 90) as single-hue Chart Teal ranked bars that filter the list; the over-90 amount is named in red-700 in the subtitle, and each open row carries its age in words, amber-800 from 61 days and red-700 past 90. Beside it, collected (columns) against billed (line) per day share one money axis.
- **Inventory** states: in stock = Chart Teal (emerald badge), running low = pending amber, out of stock = no-show crimson, expired = white + red outline with its word in red (outside the hue set, like cancelled).
- **Referrals** follow the same meaning map: waiting for reply = Chart Blue (white badge, gray outline), accepted = pending amber, seen = Chart Teal (teal-light badge), declined = no-show crimson (red badge; the patient still needs a place), cancelled = white + gray outline (+ strike on the row). Validated as a set (light and dark, all pairs); crimson is 2.8:1 on the dark surface, so every state also carries its word and count. Waiting referrals are split by days waiting (0–2, 3–7, 8–14, 15+) as Chart Teal columns that filter the list, the late buckets' counts in red-700.
- **Ordered levels (membership tiers).** A level that is a rank, not a category (Bronze < Silver < Gold < Platinum), is never given a hue per level (no metal colours, no purple). It is a **tier mark**: four 3px steps rising left to right, filled teal-dark up to the rank and gray-200 beyond, always beside the word (and, where it helps, the Mono discount). Breakdowns by tier keep the rank order (never sorted by count) as single-hue Chart Teal bars that filter the list.
- **Memberships** follow the meaning map: active = emerald badge (no badge on list rows, where it is the norm), renewal due (inside 30 days) = pending amber, expired = white + red outline with its word (as expired stock), suspended = gray fill, inactive = white + gray outline. An active membership past its end date reads as expired before the nightly job marks it.
- **Doctors** follow the same meaning map: active = Chart Teal (emerald badge), on leave = pending amber, inactive = white + gray outline (gray badge, outside the hue set). No new hue was needed.
- **Stock bar.** Stock against its reorder level in one line: a 6px bar for what is on hand (Chart Teal; amber when low; gray when expired) on a gray-100 track, and a 2px gray-500 tick where reordering starts. The scale runs to twice the reorder level so "just above" and "well stocked" differ. Decorative; the Mono figures beside it carry the numbers. Used on list rows, the reorder panel and the item's summary.
- **Period bar (subscription).** A paid period (or trial) from its start to its end as an 8px bar on a gray-100 track: filled Chart Teal up to today (pending amber inside the last 14 days) with a 2px gray-900 "Today" tick, start and end dates under it in words. It is a `meter` with the share used and days left as its value text. Not drawn once the period has ended.
- **Plan fit.** Plans are compared limit by limit against the clinic's own figures: a limit the clinic already reaches is red-700 Mono with "You have N" (plus "this month"/"today" for counts that reset) under it, and the same shortfalls are repeated in words in the payment dialog with what they will block. No "Popular" badge or feature list the system doesn't enforce.
- **Step line with a reference rule.** A level that changes in jumps (stock) is drawn as a 2px Chart Teal step line with a 10% wash, never a slope, and the threshold that matters (reorder level) as a 1px dashed gray-500 rule labelled in Mono ("Reorder at 20"). Days before the record begins are left blank, not guessed.
- **Third categorical slot:** Chart Ochre `#B45309` (used for "Other" in the patient sex split). Purple was rejected for this slot: it collapses into Chart Blue under deuteranopia (ΔE 1.3).

### Charts as filters
On list pages, a summary chart can double as the filter for the list beneath it (patients: age bands and sex segments). The figures stay clinic-wide and never shrink with the filter; the selected mark turns teal-dark, the rest drop to 30% opacity, and the same choice appears as a removable chip in the toolbar. Every chart button has a text-labelled equivalent (legend rows, the Filters panel).

`TrendChart` takes `selected` and `onSelect` to become a **day picker** (audit log): a click or Enter on a day sets the list's From and To to that day; the day's columns turn teal-dark and the rest drop to 30%; picking it again, the chip or "Show every day" clears it. The From/To date fields are its text-labelled equivalent.

### Rules
- One y-axis per chart. Two measures of the same unit (visits vs. bookings, collected vs. billed) share it; different units never share a plot.
- Marks: columns ≤ 24px with a 4px rounded data end, 2px lines, area washes at 10%, end dots r4 with a 2px white ring. Gridlines are solid gray-200 hairlines; tick labels are 12px Mono gray-500.
- Days still ahead in a week or month render as a 3px gray slot on the baseline, so the period's remaining length is visible.
- Every chart has a crosshair/tooltip (pointer and arrow keys), a legend when it has two or more series, and a "View as table" twin.

### The Clinic Day (signature)
Today's schedule as a board: one lane per doctor (max 8, the rest fold into "N other doctors"), time running across from business hours in Settings, each booking a block as wide as its duration, overlapping bookings stacked into sub-rows so double-booking is visible. Past time is a gray-50 wash; a 2px teal-dark now-line with a Mono time chip marks the present and advances every minute.

The same board draws any day (the appointments page): a past day is washed end to end, a future day not at all, and only today carries the now-line. Bookings without a time stay off the board and the panel subtitle says how many are listed below instead.

### Month load calendar
The appointments month is a chart that doubles as the day picker: each date cell carries a 3px Chart Teal bar along its foot, as long as that day's bookings relative to the month's busiest day (named in a caption beneath), with the Mono count under the date. Closed weekdays (from business hours) sit on gray-50; today has a 1px inset teal-dark ring; the selected day fills teal-dark with a white bar. One roving tab stop: arrows move by day and week, Page Up/Down by month, Home/End to the month's ends. Hover and focus show the tooltip (booked, walk-ins, cancelled), and "View as table" lists every day with bookings. Counts come from an aggregation endpoint (`/api/appointments/summary`), never from loading the month's records.

### Vital-sign trends
On a visit, each recorded vital is a ruled cell: label, Mono figure with its unit, a plain-words change against the previous reading ("up 6 since Sep 2", "was 124/80 on Sep 2"), and a 40px trend over the patient's last visits (up to eight readings, oldest left). Numeric vitals draw a 2px Chart Teal line with 8px dots ringed in white; blood pressure draws a 4px bar from diastolic to systolic per visit, so the pair needs no second hue or legend. The current visit's mark is teal-dark. Each trend is one tab stop (arrow keys, Home/End step through visits) with the shared tooltip, and one "View as table" lists every visit's readings. No clinical range colouring: the product has no reference ranges for vitals (they differ for children), so nothing turns red.

### Motion
One authored moment: on load, the clinic day's elapsed wash and now-line sweep from opening time to now (800ms, `cubic-bezier(0.16,1,0.3,1)`), and bookings fade in in time order as the sweep passes them. Supporting marks grow once from their baseline (columns 500ms, ranked bars and the status bar from the left), capped at 240ms of stagger. Refetches hold the previous render at 60% opacity, never a skeleton. Under `prefers-reduced-motion` nothing travels; marks only fade.

## Do's and Don'ts

### Do:
- **Do** use solid brand teal (hover teal-dark) for every primary action and selected state, in the public site and the authenticated app alike.
- **Do** mark the current nav row with a teal-light fill and teal-deep text, and nothing else.
- **Do** use a 2px brand-teal `focus-visible` ring on every interactive element (inset on full-bleed tiles and rows).
- **Do** build dashboard structure from white cells, gray-200 hairlines, and 8px panels on the gray-50 ground, with no shadow at rest.
- **Do** set figures, times, dates, and amounts in Geist Mono with `tabular-nums`.
- **Do** reserve green, amber, and red for status meaning, and turn a stat red only when its figure needs attention.
- **Do** render the `BrandLogo` mark exactly as implemented wherever the brand appears.
- **Do** use inline outline SVG icons at 1.75px stroke; never glyph icon fonts or emoji.

### Don't:
- **Don't** use gradient fills, gradient text, or gradient buttons anywhere; the `BrandLogo` mark is the only gradient.
- **Don't** reintroduce the legacy blue → indigo accent on new or migrated screens; screens still carrying it are pending migration.
- **Don't** add a side stripe or indicator dot to the active nav row.
- **Don't** put the page title inside a header card; it sits directly on the ground.
- **Don't** lift, scale, or shadow cards and tiles on hover; tint them.
- **Don't** shadow resting surfaces; shadows belong only to menus and the drawer.
- **Don't** apply a hard, offset ("sticker") shadow anywhere.
- **Don't** introduce a third typeface; Geist Sans and Geist Mono cover the product.
- **Don't** extend the `BrandLogo` gradient to UI elements, or flatten the mark to solid teal.
