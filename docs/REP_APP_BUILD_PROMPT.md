# Build prompt: MyClinicSoft Rep App

Paste everything below the line into Claude Code, started in an empty folder next to the other repos
(for example `C:\Users\corew\projects\clinic-management-rep`). It is self-contained, but it points
Claude at the backend and eMCR repos so it reads the real contract and code instead of guessing.

---

You are building the **MyClinicSoft Rep App**: a mobile app for pharmaceutical and medical-device
representatives ("reps") who visit clinics that use MyClinicSoft. Reps use it to book visits in a
clinic's rep hours, keep a log of their own visits, carry product sheets to a visit, and, if they
manage a company team, see their team's visits. The backend already exists and is merged; your job
is the app only. Do not change the backend repo.

## Where things are

| Path | What it is | How to use it |
| --- | --- | --- |
| `../clinic-management/MOBILE_API.md` | The API contract. Read **Conventions** and **Medical representative app** in full before writing code | Source of truth for every endpoint, field and error code. If the code and this file disagree, the code wins; tell me |
| `../clinic-management/app/api/medical-representatives/` | The route handlers behind that contract | Read a handler when the doc leaves a detail open (a field name, a status code) |
| `../clinic-management/lib/rep-visit-rules.ts` | Visit statuses, slot rules, clinic actions | Mirror these names exactly in the app's types |
| `../clinic-management-mobile/` | **eMCR**, the patient app, on the same stack | Copy its plumbing and components (listed below). Read its `AGENTS.md` and `README.md` first |
| `../clinic-management/DESIGN.md` | The web design system | Background for the brand rules below |

Read before you write. If a file above is missing or a path is wrong, stop and tell me rather than
working from memory.

## Stack

- Expo SDK 57, React Native 0.86, Expo Router, TypeScript, matching eMCR's `package.json` versions.
- Expo has changed since your training data. Read the versioned docs at
  https://docs.expo.dev/versions/v57.0.0/ for any Expo API before you use it.
- A separate app from eMCR: its own name ("MyClinicSoft Rep", to confirm), bundle id
  `solutions.myclinicsoft.rep`, EAS project and icon. A rep can also be a patient, so the two apps
  must never share storage keys or push registrations.
- `EXPO_PUBLIC_API_URL` is the main domain (`https://www.myclinicsoft.solutions` in production, the
  local dev server in development). Never call a clinic subdomain.

Copy these from eMCR rather than rewriting them, then adapt names and endpoints:
`lib/api.ts` (Bearer auth, single-flight token refresh), `lib/storage.ts` (secure store),
`lib/push.ts` and `components/NotificationResponder.tsx` (Expo push and tap routing),
`lib/offlineCache.ts` (encrypted last-loaded data), `lib/usePaginatedList.ts`, `lib/useApiData.ts`,
`lib/i18n` (English and Filipino), `lib/theme.ts`, `lib/format.ts`, and from `components/`:
`ui.tsx`, `ErrorState.tsx`, `OfflineBanner.tsx`, `AppHeader.tsx`. Copying is deliberate: we are not
creating a shared package yet.

## What the app does (v1)

Everything below is supported by the existing API; v1 needs no new backend work. Endpoint paths are
under `/api/medical-representatives`.

**Sign-in and session**
- `POST /auth/token` with email and password. A `401` with `requires2fa: true` and a `pendingToken`
  leads to a code screen (`POST /auth/2fa`, within 5 minutes).
- Keep `token` and `refreshToken` in secure storage only. On any `401`, refresh once
  (`POST /auth/refresh`), store both new tokens, retry. One refresh in flight at a time. A failed
  refresh goes to sign-in. Follow the refresh rules in MOBILE_API.md Conventions exactly; they cover
  lost replies and token reuse.
- Register the device after sign-in and on launch (`POST /devices`). Sign out on this device
  (`DELETE /session?deviceId=…`) and everywhere (`DELETE /session?all=true`).
- Word the sign-in refusals: `PASSWORD_SETUP_REQUIRED` ("Open the invite email to set your
  password"), `MEDREP_INACTIVE` ("Your account isn't active yet", with a Support link),
  `USER_INACTIVE` (server message), `429` ("Too many tries. Wait a few minutes").
- Registration stays on the web. The app only signs in.

**Five bottom tabs**

| Tab | Contents | Endpoints |
| --- | --- | --- |
| Home | Next-visit card first; counts (this month, waiting on clinic, expiring products); upcoming list; banners for a team invite or for booking needing a plan | `GET /dashboard`, `GET /subscription`, `GET /team` |
| Visits | Segments Upcoming (requested + approved), Past, My log; date filter; Visit detail; Log a visit | `GET/POST /visits`, `GET/PUT/DELETE /visits/[id]` |
| Clinics | Searchable directory, hours, instructions, "linked" badge; Book a slot sheet | `GET /clinics`, `GET /clinics/[id]/slots?date=`, `POST /visits` with `clinicId` |
| Products | Catalog with status filter, expiring-soon badge (30 days), add/edit/delete | `GET/POST /products`, `GET/PUT/DELETE /products/[id]` |
| More | Team, Plan, Support, Profile, Settings (push and email switches, change password, sign out) | `/team…`, `/subscription…`, `/support`, `/session`, `/profile`, `/notifications`, `/change-password` |

**Booking a clinic visit**
- Clinic → Book opens a full-height sheet: a date strip up to the clinic's `maxAdvanceDays` (days
  without rep hours greyed, not hidden), a 3-column slot grid showing seats left (full slots
  disabled), a required Purpose field, optional products (up to 10 of the rep's own active ones) and
  an optional private note, and Send pinned above the keyboard.
- Send creates a visit with status `requested`. Show a success state on the sheet that names the
  clinic, day and time and says the rep will be told when the clinic answers, then land on the new
  visit in Upcoming.
- Statuses and who moves them (from `lib/rep-visit-rules.ts`): the clinic approves (`scheduled`) or
  declines a request, then completes it, marks a no-show, or cancels. The rep can only **move** a
  booking (new date and time, which sends it back to `requested`) or **cancel** it. Check-in is not a
  status: the clinic sets `checkedInAt` on an approved visit, and the app then shows "Checked in".
- A booked visit that is still open cannot be deleted (`VISIT_ACTIVE`): offer Cancel instead.
- The rep's own log entries (no `clinicId`) are edited freely with `scheduled`, `completed` or
  `cancelled`.
- `notes` are private to the rep; `purpose` is shown to the clinic. Label the notes field "Only you
  see this".
- Times are `HH:mm` in the clinic's timezone. A visit's `date` is a calendar day: use its first 10
  characters and never convert it to the phone's timezone.

**Status language** (the same pill everywhere: word + icon + colour, never colour alone)

| Status | Pill | Next-step line |
| --- | --- | --- |
| requested | Waiting (warning tones) | "Waiting for the clinic to answer" |
| scheduled | Approved (primarySoft) | "Arrive by HH:mm" plus the clinic's instructions |
| scheduled + checkedInAt | Checked in (primary) | "Checked in at HH:mm" |
| completed | Done (slate) | "Completed" |
| declined | Declined (danger tones) | The clinic's note, or "The clinic declined this time" |
| no-show | Missed (danger tones) | "The clinic marked you as not arriving" |
| cancelled | Cancelled (muted, struck through) | "Cancelled by you" / "by the clinic" (`cancelledBy`) |
| own log entry | Log (slate outline) | none |

Show `clinicNote` as a quote attributed to the clinic ("Sunrise Clinic wrote"), never as the app's
own words.

**Push and deep links.** The server sends Expo pushes with `data.screen` (`visits`, `products` or
`team`) and sometimes `id`. A tap opens the matching detail (or list when there is no `id`). When the
app is in the foreground, refresh the visible list instead of showing a banner. Ask for notification
permission after the first sign-in, on a screen that says what the rep will receive.

**Plan (subscription).** Booking with clinics is free today, but a platform admin can set a price at
any time, so build the paid path now.
- `GET /subscription` → `canBookClinics`, `coveredBy` (`free` / `individual` / `team`), prices,
  `payable`.
- When booking is not covered, Book stays visible and opens the Plan screen. A
  `402 SUBSCRIPTION_REQUIRED` does the same.
- Pay: `POST /subscription/checkout` returns `checkoutUrl`; open it in `expo-web-browser` as eMCR
  pays invoices. The plan applies when PayMongo confirms, not when the browser closes: afterwards,
  poll `GET /subscription` every few seconds for up to a minute, then say "Payment is being
  confirmed".
- Never hard-code prices. Hide Pay when `free` is true or `payable` is false.

**Teams.** Any rep can start a team and becomes its manager.
- No team: start one, or accept or decline a pending invite (tell the invitee the manager will see
  their visits but never their private notes).
- Manager: members with this month's counts, pending invites, invite by email (always reply "If they
  use the app, they'll get your invite": the API deliberately doesn't reveal whether the email
  exists), remove a member, team visits filtered by member, buy seats
  (`POST /team/checkout`, at least the member count; say there is no pro-rating).
- Member: team name, managers, member count, Leave.

**Errors.** Every error is `{ success: false, error, code? }`. Switch on `code`; otherwise show
`error`. Handle every code listed in MOBILE_API.md for reps. The important ones: `SLOT_FULL` (reload
slots, keep the typed purpose), `SLOT_UNAVAILABLE`, `DUPLICATE_REQUEST` (link to the existing visit),
`VISIT_CHANGED` (reload detail), `VISIT_CLOSED`, `VISIT_ACTIVE`, `TEAM_FULL`, `TEAM_HAS_MEMBERS`,
`TOO_FEW_SEATS`, `PAYMENT_UNAVAILABLE`. A `404` on a clinic's slots means the clinic stopped taking
reps: drop it from the list.

**Offline.** Home, Visits, Products and Team read from eMCR's encrypted cache when offline, under the
offline banner. Writes need a connection and say so; never lose what the rep typed.

## Design

The app is a sibling of eMCR, not a new look. Use eMCR's `lib/theme.ts` tokens unchanged.

Principles, in priority order (the earlier one wins when two conflict):
1. **Next visit first.** Home opens on the next approved visit: clinic, day and time, address,
   status, next step, Directions and Call.
2. **Three taps to a request.** Clinic → slot → Send. Purpose is the only required field.
3. **Status at arm's length.** Word + icon + colour, readable in a bright corridor.
4. **Say who acts next** on every visit, so the rep never wonders whether to call the clinic.
5. **Works on bad signal.** Cached lists show instantly; writes fail gracefully and keep input.

Rules:
- One teal (`primary`) means "act here" or "selected". Green, amber and red carry status only.
- No gradients. No shadows on resting cards; a sheet or modal may cast one soft shadow.
- Times, dates, seat counts and prices in a monospaced face with tabular numerals.
- Type: screen title 28 bold, card title 17 semibold, body 15, secondary 13, pill 12 semibold;
  nothing smaller than 12.
- 4-point spacing (4, 8, 16, 24, 32); card radius 12, chips 8, sheet top 16; touch targets at least
  48 × 48.
- Ionicons outline, one icon per meaning; no emoji.
- Loading: cached content immediately with a thin progress bar; skeletons only on a first-ever load.
- Confirm only actions the clinic sees (Cancel, Move). Deleting a closed visit uses an undo snackbar.
- Haptics: a light tap on slot select and a success tap on Send; nowhere else.
- App icon: the brand mark on navy, so it is distinct from eMCR's on the same phone.

New components to build (everything else comes from eMCR): next-visit card, visit row, date strip,
slot grid, product sheet card, team member row, plan card.

**Accessibility and language.** Contrast at least 4.5:1. Every control has an accessibility label;
statuses are read as words ("Sunrise Clinic, Tuesday 4 November, 3 PM, approved"); slot chips read
"15:00, 2 seats left" or "15:00, full". Layouts reflow at the largest text size (the slot grid drops
to 2 columns). Respect Reduce Motion. English and Filipino through eMCR's i18n; format dates from the
locale, never by hand; never translate clinic names, product names or times.

## How to work

Build in four phases. Finish and verify each before starting the next, and stop after each phase to
summarise what you built, what you verified and anything you couldn't, so I can review.

1. **Foundation:** project setup, theme and components copied from eMCR, sign-in with two-step code,
   token refresh, device registration, Profile, Settings, Support.
   *Done when* a rep signs in, survives an expired access token (the app refreshes and retries),
   signs out, and the device registers for push.
2. **Own work:** Home, Visits with the own log, Products, offline cache, the daily reminder pushes.
   *Done when* everything works on a phone, including offline reading of the last-loaded lists.
3. **Clinic booking:** Clinics, slot sheet, request, move, cancel, every visit push and its deep
   link, products on visits.
   *Done when* a full run works against the local backend: request in the app, approve on the web
   (`/medical-reps` → Visit requests), check in, complete, and each push opens the right screen.
4. **Teams and plan:** Team screens, manager view, Plan with checkout, the paid-booking gate.
   *Done when*, with the rep fee set above ₱0 in a test environment, booking is blocked without a
   plan and works after paying, and team seats cover members.

Ground rules:
- Use only endpoints and fields that exist in MOBILE_API.md or the route handlers. If you need one
  that doesn't exist, stop and tell me; don't fake it in the app.
- Type every API response from the contract. Mirror status names exactly.
- Keep screens thin: data fetching in hooks under `lib/`, as eMCR does.
- Test against the local backend (`pnpm dev` in `../clinic-management`, local MongoDB in Docker; dev
  admin `admin1@my-clinic.dev` / `devpassword` at `my-clinic.localhost:3000`). Reps need an activated
  account and a clinic with rep visiting hours turned on (`/medical-reps` → Visiting hours). Use the
  local database only, never production.
- Run the typecheck before calling a phase done. Report failures as they are; don't hide them.
- Commit per phase on a branch with a clear message. Don't push or open PRs unless I ask.

## Open questions (ask me when you reach them; don't decide alone)

- **App store payment rules.** Apple and Google may require in-app purchase for the rep subscription.
  Before phase 4, flag this; payment may have to move to the web with the app only showing status.
- **Forgotten password.** There is no reset flow for reps yet. Ask before building one.
- **App name and icon wording.** "MyClinicSoft Rep" is the working name.
- **Dark mode.** Proposed: light only for v1, like eMCR.
- **Directions.** Proposed: open the phone's maps app with the clinic address; no in-app map.
- **Tablet layout.** eMCR supports tablets; ask whether reps need a full-screen product sheet for
  showing a doctor.
