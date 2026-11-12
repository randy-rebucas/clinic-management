# Running a Production Data Migration

## Summary

"Running a Production Data Migration" is the procedure for changing data or indexes in the MyClinicSoft production database with the migration scripts in the web platform repository. It is written for the engineers who operate production. Every migration script runs as a dry run by default and writes only when given `--apply`; production is reached only through `pnpm prod <script>`, which shows the target database and asks for confirmation. A migration that new code depends on runs against production before that code is deployed (`README.md`). Index changes are made with `pnpm prod db:indexes`, because production does not build indexes by itself.

## Purpose

The purpose of "Running a Production Data Migration" is to change production data safely and on purpose: always seeing what will change before it changes, always knowing which database is targeted, and keeping a way back. Sources: `README.md` ("Migrations"), `scripts/prod.ts`, `scripts/migrate-*.ts`, `scripts/sync-indexes.ts`, `docs/LOCAL_DEV_DATABASE.md` and `docs/SMS_TWILIO.md`.

## When this procedure applies (and when it does not)

The migration procedure applies to:

- running any `scripts/migrate-*.ts` script against production;
- creating or dropping production indexes with `db:indexes`;
- other one-off production data scripts run through `pnpm prod`, such as `db:mark-invoices-paid` or `db:cleanup:notifications` [TO CONFIRM: whether these follow the same procedure].

The migration procedure does not apply to restoring data after damage ("Restoring the Database After an Incident"), deleting a closed clinic ("Deleting a Closed Clinic's Data"), or the local Docker database, which is refreshed and scrubbed with `pnpm db:local:refresh` (`docs/LOCAL_DEV_DATABASE.md`).

## When this procedure applies: migration scripts in the repository

The migration scripts in the MyClinicSoft web platform repository, as found on 2026-11-10, are listed below. Each one runs as a dry run unless given `--apply`.

| Package script | What it does | Notes from the script |
|---|---|---|
| `db:migrate:audit` | 2026-10 audit: drops obsolete indexes, reports duplicates, syncs indexes, sets a prescription paper-size default | Run before deploying the new code, or new unique indexes may fail on duplicates |
| `db:migrate:sms-enabled` | Turns each clinic's text switch on before rules are enforced | Part of "Going Live with SMS and Phone Codes" |
| `db:migrate:emcr-temp-passwords` | Ties staff-issued eMCR temporary passwords to the issuing clinic | Accounts with no matching invite are only listed, for a person to decide |
| `db:migrate:contact-family-links` | Limits family links made through a contact number to one clinic | Writes an undo file to `backups/` before applying |
| `db:migrate:attachment-tenants` | Stamps each patient file with the clinic that uploaded it | Files with no clear owner are listed and left unassigned |
| `storage:migrate-attachments` | Moves inline files to Cloudinary | Resumable; `--limit`; needs the Cloudinary settings |
| `storage:migrate-private` | Makes older public Cloudinary uploads private | Resumable; `--limit`, `--delay`, `--include-orphans` |
| none (`scripts/migrate-sidebar-expanded.ts`) | Resets the sidebar setting to expanded for every clinic | No package script (see "Exceptions and what to do") |

Which of these have already run in production is not recorded anywhere [TO CONFIRM: migration run history].

## Roles involved

| Role | Responsibility |
|---|---|
| Migration author [TO CONFIRM: role title] | Writes the script with a dry run by default, documents the run order in the script header and the pull request |
| Operator [TO CONFIRM: role title] | An engineer with the production settings file; runs the dry run and the apply, and records the counts |
| Approver [TO CONFIRM: role title] | Reviews the dry-run output and approves the apply |
| Platform admin | Decides records the script leaves for a person (for example unassigned files) [TO CONFIRM: who decides] |

## Inputs needed before starting

1. The merged or approved code containing the migration script, checked out locally with dependencies installed (`pnpm install`).
2. The production settings file `.env.prod.local` with `MONGODB_URI`. It is deliberately not named `.env.production.local`, so `next build` and `next start` never load it (`docs/LOCAL_DEV_DATABASE.md`).
3. MongoDB Database Tools on the PATH, for a backup before a risky migration.
4. The order of work: whether the migration runs before or after the code deploy (stated in each script header and in `README.md`).
5. A terminal session: `pnpm prod` asks `y/N` and refuses to run without a terminal unless `--yes` is passed.

## Procedure: prepare

1. **Migration author (pull request):** states in the pull request which migrations or index changes the code needs, and whether they run before or after deploy [TO CONFIRM: whether this is required].
2. **Operator (command line):** optionally rehearses on the local Docker database, which holds an anonymised copy of production: every `pnpm db:*` script uses `.env.local` by default [TO CONFIRM: whether a local rehearsal is required].
3. **Operator (command line):** if the migration is risky, then takes a fresh production backup with `pnpm prod db:backup:zip` before going on. If not, go to step 4.

## Procedure: dry run and apply

4. **Operator (command line):** runs the dry run against production, for example `pnpm prod db:migrate:sms-enabled`. `pnpm prod` prints the database and the command and asks "Run it against production? [y/N]". The operator checks the database shown is production and answers `y`.
5. **Operator:** reads the dry-run report (counts, duplicates, records left for a person) and sends it to the approver. If the counts are not what was expected, then stop and go back to the migration author.
6. **Approver:** approves the apply [TO CONFIRM: approval channel].
7. **Operator (command line):** runs the same command with `--apply`, for example `pnpm prod db:migrate:sms-enabled --apply`, and checks the reported changes match the dry run.
8. **Operator:** for a resumable script stopped part way (Cloudinary migrations), runs it again with `--apply`; it carries on where it stopped.

## Procedure: indexes and deploy

9. **Operator (command line):** runs `pnpm prod db:indexes` to list missing indexes, then `pnpm prod db:indexes --apply` to create them. Production runs with automatic index building off (`lib/mongodb.ts`).
10. **Operator (command line):** to remove indexes no schema declares, runs `pnpm prod db:indexes --drop` (dry run), then `--drop --apply`. Unique, TTL and partial indexes are left alone unless named with `--allow=collection.indexName`.
11. **Operator:** deploys the code, or confirms it was deployed in the right order (see "Engineering Standards and Release Procedure").
12. **Platform admin:** resolves any records the script listed for a person to decide.
13. **Operator:** records the run (see "Outputs and where they are recorded") and deletes any local backup files that are no longer needed.

## Approvals required

| What | Who approves | Limit |
|---|---|---|
| Running `--apply` against production | Approver [TO CONFIRM: role title] | [TO CONFIRM] |
| Dropping indexes, especially with `--allow` | Approver [TO CONFIRM] | [TO CONFIRM] |
| Using `pnpm prod --yes` (no confirmation) | [TO CONFIRM] | Meant for automation (`scripts/prod.ts`) |

No written rule states who approves production migrations.

## Exceptions and what to do

| Exception | What to do |
|---|---|
| `.env.prod.local` missing or without `MONGODB_URI` | `pnpm prod` stops; restore the production settings file before going on |
| The dry run reports duplicates blocking a unique index (`db:migrate:audit`) | The affected collection is not synced; fix the data first, then run again |
| The migration did the wrong thing | `db:migrate:contact-family-links` has an undo file in `backups/`; otherwise restore from the backup in step 3 or follow "Restoring the Database After an Incident" [TO CONFIRM: general migration rollback] |
| A script has no package script (`scripts/migrate-sidebar-expanded.ts`) | The script cannot run through `pnpm prod`; [TO CONFIRM: how such scripts are run against production, if ever (contradiction 63)] |
| Backup files on a laptop | Backup files hold real patient data and password hashes: keep them on an encrypted disk, never commit or share them, delete them when done |

## Outputs and where they are recorded

| Output | Where recorded |
|---|---|
| Dry-run and apply output (counts) | [TO CONFIRM: run log location]; the pull request is proposed |
| Undo file (contact-family-links only) | `backups/` on the operator's machine (not in the repository) |
| Records left for a person to decide | [TO CONFIRM: where they are tracked] |
| Which migrations have run in production | [TO CONFIRM: migration run history] |

## Time targets

| Target | Value | Source |
|---|---|---|
| Migration needed by new code | before that code is deployed | `README.md` |
| Index creation | before deploy (`docs/SMS_TWILIO.md`) or after deploy (`scripts/sync-indexes.ts`, `docs/BACKUP_RESTORE.md`) [TO CONFIRM: rule (contradiction 61)] | see Open questions |
| Time of day for heavy migrations | off-peak is mentioned only for one cleanup (`docs/SMS_TWILIO.md`) [TO CONFIRM: rule] | |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Engineering Standards and Release Procedure; Going Live with SMS and Phone Codes; Restoring the Database After an Incident; Deleting a Closed Clinic's Data; Systems Overview |

## Open questions

1. Which other one-off production scripts (for example `db:mark-invoices-paid`, `db:cleanup:notifications`) follow this procedure.
2. Which migrations have already run in production, and where the run history is kept.
3. Role titles for the migration author, operator and approver; who approves `--apply`, index drops and `--yes`.
4. Whether the pull request must state the migrations and their order.
5. Whether a rehearsal on the local database is required.
6. The approval channel and where run output is recorded.
7. Who decides records the scripts leave for a person, and where they are tracked.
8. General rollback for a migration: only `db:migrate:contact-family-links` writes an undo file.
9. How a script with no package script (`scripts/migrate-sidebar-expanded.ts`) is run against production, if ever (contradiction 63).
10. Index timing: `docs/SMS_TWILIO.md` says run `pnpm prod db:indexes --apply` "Before deploying this code"; `scripts/sync-indexes.ts` says "run this after deploying a change that adds or removes an index"; `docs/BACKUP_RESTORE.md` says "After deploying, run `pnpm prod db:indexes --apply`". (contradiction 61).
11. `README.md` says each migration script "prints the database it connects to"; only `scripts/migrate-attachments-to-cloudinary.ts` and `scripts/migrate-patient-attachment-tenants.ts` do, although `pnpm prod` always prints the target database first. (contradiction 62).
12. Whether heavy migrations must run off-peak, and in which hours (Asia/Manila).
