# Local development database

Local development runs against MongoDB in Docker, loaded from a production backup **with personal data and secrets removed**. Production is only touched on purpose, through `pnpm prod <script>`.

## How it fits together

| File | Points at | Used by |
|---|---|---|
| `.env.local` | `mongodb://127.0.0.1:27017/clinic-management` (Docker) | `pnpm dev` and every `pnpm db:*` script |
| `.env.prod.local` | the production Atlas cluster and live integrations | only `pnpm prod <script>` |

Both files are gitignored (`.env*.local`). The production file is deliberately **not** called `.env.production.local`, because `next build` / `next start` load that one automatically.

`.env.local` also has its own `SESSION_SECRET` and `ENCRYPTION_KEY`, and leaves SMTP, PayPal and web push unset. Nothing in local dev can email, charge or notify a real person, and a production secret left in the data can't be decrypted locally.

## First-time setup

Needs Docker and the MongoDB Database Tools (`mongodump` / `mongorestore`) on PATH.

1. Put the production settings in `.env.prod.local` (a copy of the old `.env.local`), and point `.env.local` at `mongodb://127.0.0.1:27017/clinic-management` with fresh secrets. `.env.example` lists every variable.
2. `pnpm db:local:up` starts MongoDB 8.0 (same version as Atlas), listening on this machine only.
3. Make a fresh backup of production: `pnpm prod db:backup:zip`. It lands in `backups/` and is gitignored.
4. `pnpm db:local:refresh` loads the newest backup and anonymizes it.
5. `pnpm dev`, then open `http://<clinic-subdomain>.localhost:3000/login`.

## Signing in

Every staff account becomes `<role><n>@<clinic-subdomain>.dev` with password **`devpassword`**. 2FA and "must set password" are switched off. `db:local:refresh` prints the full list, for example:

```
my-clinic      admin          admin1@my-clinic.dev
kidz-klinika   receptionist   receptionist1@kidz-klinika.dev
```

## Commands

| Command | What it does |
|---|---|
| `pnpm db:local:up` / `db:local:down` | start / stop the container (data is kept in the `clinic-mongo-data` volume) |
| `pnpm db:local:refresh [zip]` | replace the local database with the newest (or given) `backups/*.zip`, scrub it, build missing indexes |
| `pnpm db:local:scrub` | scrub what's already loaded again (safe to repeat) |
| `pnpm prod <script> [args]` | run any package script against production; shows the cluster and asks `y/N` (`--yes` skips the question) |

Examples: `pnpm prod db:indexes --drop` (dry run), `pnpm prod db:backup:zip`, `pnpm prod db:cleanup:notifications`.

The refresh and scrub refuse to run unless `MONGODB_URI` is a single host on this machine (`scripts/dev-db/guard.ts`).

## What the scrub changes

`scripts/dev-db/scrub.ts`, using raw driver writes so no save hook sends an invite email:

- **Patients:** fake names, `0900…` phone numbers, `@dev.local` emails, a generic address, and birth dates moved within the same year. Contacts, government and PhilHealth IDs, credentials, attachments and free-text notes are removed. Clinical data and `patientCode` are kept.
- **Staff and medical reps:** fake names and contacts, dev logins, license and PTR numbers replaced, signature images removed.
- **Copied names** on queues, invoices (`billedTo`), HMO claims and digital signatures follow the fake names.
- **Secrets and outbound links:** payment account keys, platform payment secrets, webhook endpoints (disabled), third-party lab keys, activation codes, feedback tokens and teleconsult rooms are removed. Refresh tokens, nonces, webhook deliveries, devices, push subscriptions and API keys are emptied.
- **Files:** attachments and images are cleared, and documents point at a placeholder instead of Cloudinary.
- **Logs and messages:** audit logs lose IP, user agent, change details and query strings, and keep only "action resource" as the description. Chat, patient messages, survey comments and support replies are redacted.

It finishes with a **self-check**. Besides checking specific fields, it scans every string in every collection for an email, PH mobile number or Cloudinary link that isn't one of the scrub's own, and fails if it finds one. If you add a model or field that holds personal data, add it to the scrub; the scan will tell you if you forget.

What stays: clinical narrative (SOAP notes, diagnoses, lab values), de-identified through the patient changes. A name typed inside such free text is the remaining risk, so treat the local database as sensitive anyway.

## Handling backups

`backups/*.zip` contain **real** patient data and password hashes. Keep them on an encrypted disk, never commit or share them, and delete old ones once the local database is refreshed. `db:local:refresh` deletes its unzipped copy as soon as the restore is done.
